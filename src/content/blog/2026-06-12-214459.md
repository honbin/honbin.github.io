---
title: "観測者は割り込まない ― WebView 向け dev コンソールを作って見えてきたこと"
pubDate: 2026-06-12T21:44:59+09:00
updatedDate: 2026-06-14T14:27:43+09:00
draft: false
---
自前の WebView 用 dev コンソールを作っていて、何度も同じ失敗をした。

-   レスポンスを観測したつもりが、body を壊す。
-   エラーを拾ったつもりが、framework の制御フローまで赤く表示する。
-   デバッグツールが、アプリと一緒に落ちる。

原因はどれも同じだった。観測者が、対象に割り込んでいた。

補足すると、オンデバイスで使える定番として eruda / vConsole があり、実装からは多くを学んだ（後で出てくる技法のいくつかは、ソースを読んで参考にしたもの）。ただ自分の用途とは前提が噛み合わない部分があって、最終的に `fetch` / `console` を patch する自前のコンソールを vanilla（依存ゼロ）で作ることにした。

この記事は「ツールの紹介」ではなく、そこで得た「割り込まない観測」の知見をまとめたもの。

-   `fetch` のレスポンスは `clone()` で裏読みすると壊れることがある → Proxy 観測
-   既存 OSS は「利用する」だけでなく「ソースを読む」ことで得られるものがある（技法を参考にし、設計上のトレードオフを理解する）
-   dev ツールは対象から独立させる（vanilla + shadow DOM + global patch）
-   「見えてるこの要素は DOM のどこ？」を一発で解決する（Pick）
-   エラーバッジの精度は `preventDefault` を尊重して保つ

* * *

## 1\. fetch のレスポンスは clone で読むと壊れることがある

ネットワークを覗くには `window.fetch` を patch して body を記録したい。`Response.body` は一度しか読めないストリームなので、`clone()` して裏で読むのが定石に見える。

```js
window.fetch = async (...args) => {
  const res = await origFetch(...args)
  res.clone().text().then(body => record(body)) // 裏で body を読む
  return res
}
```

ところが `fetch` を使うライブラリ（自分の場合は connect-web + React Query）は、レスポンスを読み終えると `AbortController.abort()` で後片付けをする。これ自体は正しい振る舞い。問題は裏で走らせていた `clone().text()` の方で、まだ読んでいる最中に中断され、`AbortError` で失敗する。body が取れないどころか、誰も catch しない rejection としてコンソールに残る。

### Proxy 観測

「裏で先読みする」のをやめて、原本の Response を `Proxy` で包み、消費側が `text()/json()/arrayBuffer()` を呼んだ“結果”を観測する。差し替えないので透過で、先読みしないので abort レースも起きない。

```js
const proxyResponse = (res) =>
  new Proxy(res, {
    get(target, prop) {
      if (prop === 'json') {
        return async () => {
          const v = await target.json()
          record(JSON.stringify(v)) // 消費側が読んだ瞬間に観測
          return v
        }
      }
      // text / arrayBuffer も同様にフック
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })

window.fetch = async (...args) => proxyResponse(await origFetch(...args))
```

肝は「観測者は割り込まない」こと。消費側から見ると返ってくる Response は本物と区別がつかない（フックしないメソッドは全部 `Reflect.get` + `bind` で素通し）。フックしたメソッドだけ薄く包んで、実際に読まれた値を記録する。先読みしないので、誰も読まなければ何も起きない＝壊れない。`res.url` / `redirected` / body ストリーム / `bodyUsed` も保たれる。

振り返ると、`clone()` 自体が悪かったわけではなく、問題は「観測のために、対象を読む“もう一人の消費者”を増やした」こと。観測者が消費者として振る舞った瞬間に、もう割り込んでいる。Proxy 観測は「消費者を増やさず、本来の消費者が読んだ結果に相乗りする」という、その一点を守るための道具。

ちなみに XHR（axios 等）は `responseText` がそのまま読めるので、Proxy も abort 対策も不要。`fetch` だけが特殊だった。

## 2\. 既存 OSS は「利用する」だけでなく「ソースを読む」

オンデバイス dev コンソールには eruda / vConsole といった定番がある。最初はそのまま使えばと思っていたが、自分の用途（API が connect-web、データ取得が React Query）では噛み合わない点があり、結局 vanilla で自作することにした。

その過程で効いたのが、既存 OSS を「利用する」だけでなく「実装のリファレンスとして読む」ことだった。読むと、採用したい技法もあれば、自分の用途では前提が合わない実装も見つかる。たとえば 1 の Proxy 観測は既存実装から参考にした技法だし、一方で「レスポンスを clone で先読みする」アプローチは、自分のケースでは abort レースの原因になり得ると分かった。どちらも、自分の設計判断に根拠を与えてくれる。

ソースを読む過程で気づいた点は、実際に upstream へ修正提案として送ったりもした。車輪の再発明をしながらでも、読む習慣があると各所の「なぜ」が埋まっていく。

## 3\. dev ツールは対象から独立させる

dev ツールを React コンポーネントとしてアプリのツリーに載せると、アプリが壊れた時にツールも一緒に死ぬ。一番ツールが欲しいのは「アプリが壊れた時」なのに、だ。

なので UI も含めて vanilla DOM + global patch（`fetch`/`console` の差し替え）+ shadow DOM で組み、アプリのフレームワークに一切依存させない。shadow DOM はアプリの CSS と相互汚染しないための隔離でもある。eruda / vConsole が vanilla なのも、突き詰めると同じ理由だと思う。

## 4\. 「見えてるこの要素は DOM のどこ？」を一発で

小画面で DOM ツリーを手で展開して目的の要素を探すのは苦痛だ。DevTools の inspect（要素ピック）が効く。

実装は意外と素直：inspect モード中、ページのタップを capture phase で横取りして（`document.addEventListener('click', handler, true)` ＋ `preventDefault` でアプリの onClick を抑制）、`event.target` の要素を取り、その `getBoundingClientRect()` で枠を被せるだけ。eruda はこれをリッチな overlay でやっているが、ただの枠なら数十行で済む。

「画面で見えてるこれ → DOM のどこ？」を一発で解決できると、モバイルの DOM デバッグは一気に楽になる。

そしてこれも、突き詰めると観測者の話。DOM ツリーを書き換えて目的の要素を探すのではなく、ユーザーが見ている要素を観測するだけに留めている。ハイライトの枠も `pointer-events: none` でページ操作を邪魔しない。inspect 中だけはタップを `preventDefault` で借りるが、これは恒常的な副作用ではなく「その瞬間だけの明示的な横取り」で、DOM には手を入れない。「探す」ために対象をいじらない、という意味で 1・3・5 と地続きな気がしている。

## 5\. エラーバッジの精度は preventDefault を尊重して保つ

コンソールに「エラー件数バッジ」を出すと、`window.error` / `unhandledrejection` を拾って数えたくなる。が、そのまま数えるとフレームワークの制御信号まで赤くカウントしてしまう。

たとえば Next.js の `redirect()` は内部的に `NEXT_REDIRECT` を throw する。これは制御フローであってエラーではない。framework 側は `event.preventDefault()` でこれを「handled」扱いにし、ネイティブのコンソールには出さない。

ところが自前のリスナは preventDefault されても発火するので、何もしないと「ネイティブには出ないのに自前ツールにだけ赤いエラーが出る」状態になる。

対処は、`event.defaultPrevented`（先に別ハンドラが handled 扱いにしたか）を見て、handled なら warn に格下げ＝エラー件数に数えない。「見せる」自体は残す（dev コンソールの価値は「ネイティブが隠すものを見せる」ことなので）が、赤いバッジ＝本当に未処理の異常、という線をはっきりさせる。

## まとめ

-   レスポンスを覗くなら clone より Proxy 観測（透過・abort レースを踏まない）
-   既存 OSS は「利用する」だけでなく「ソースを読んで技法を参考にし、設計上のトレードオフを理解する」対象にできる
-   dev ツールは対象から独立（vanilla + shadow DOM + global patch）させると、アプリが壊れても死なない
-   inspect（Pick）は `click` capture + `getBoundingClientRect` で素直に作れる
-   エラーバッジは `preventDefault` を尊重すると「未処理の異常」アラートとして信頼できる

冒頭の三つの失敗は、結局ひとつの原則に還元できた。観測者は割り込まない。

-   **対象を壊さない** ── body を消費しない（Proxy 観測）
-   **運命を共にしない** ── アプリと一緒に死なない（vanilla + shadow DOM + global patch）
-   **意味を上書きしない** ── 対象が handled とした信号を再解釈しない（`preventDefault` を尊重）

この三つを守ると、観測ツールは「アプリが壊れた時にこそ使える」道具になる。逆に言えば、ブラウザを patch して観測する footgun は、たいてい「どこかで対象に割り込んでいる」に還元できた。その一つ一つに「なぜ割り込んではいけないか」を詰めるのが、そのまま勉強になった。

* * *

面白かったのは、この原則を意識する前は、全部が個別のバグに見えていたこと。`fetch` の `AbortError`、Next.js の `redirect` が赤く出ること、DevTools の UI をアプリから分離すること──最初はバラバラの問題として、その都度パッチを当てていた。

個別の対処を覚えるより、「観測者は割り込まない」という原則を持っておく方が応用が利く。今回の三つの問題は、結局その一文に還元できた。
