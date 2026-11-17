---
title: "Google Calendar API の利用制限は、権限不足と同じ PERMISSION_DENIED で返ってきた"
pubDate: 2026-11-17T15:52:06+09:00
draft: false
---
Google カレンダーに予定を書き込む iOS アプリを作っている。
書き込みが続くと、API の利用制限に当たることがある。
そのときは 429 が返り、何秒待てばよいかが `Retry-After` に入っているものと思っていた。

上限を下げたプロジェクトでわざと制限に当ててみると、そうではなかった。
2026 年 11 月 16 日に、Google Calendar API の v3 で確かめた。応答の形は、今後変わるかもしれない。

## わざと制限に当てる方法

確かめるためだけの Google Cloud のプロジェクトを作り、そこで試した。
Calendar API の割り当ての画面で、利用者ごとの 1 分あたりの上限(Queries per minute per user)を、600 から 20 に下げた。
上限は、既定より下げるだけなら自分で変えられる。

この状態で、テスト専用の Google アカウントから、カレンダーの一覧を読む通信を続けて送った。
読むだけの通信なので、何も書き換えない。
20 件目で断られた。

## 返ってきた応答

状態コードは 403 だった。本文は次のとおり(プロジェクトの番号は伏せている)。

```json
{
  "error": {
    "code": 403,
    "message": "Quota exceeded for quota metric 'Queries' and limit 'Queries per minute per user' of service 'calendar-json.googleapis.com' for consumer 'project_number:<番号>'.",
    "errors": [
      {
        "message": "Quota exceeded for quota metric 'Queries' and limit 'Queries per minute per user' of service 'calendar-json.googleapis.com' for consumer 'project_number:<番号>'.",
        "domain": "usageLimits",
        "reason": "rateLimitExceeded"
      }
    ],
    "status": "PERMISSION_DENIED",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        "reason": "RATE_LIMIT_EXCEEDED",
        "domain": "googleapis.com",
        "metadata": {
          "quota_unit": "1/min/{project}/{user}",
          "quota_limit": "defaultPerMinutePerUser",
          "quota_metric": "calendar-json.googleapis.com/default",
          "consumer": "projects/<番号>",
          "quota_limit_value": "20",
          "service": "calendar-json.googleapis.com",
          "quota_location": "global",
          "window_start_time": "1794794980"
        }
      },
      {
        "@type": "type.googleapis.com/google.rpc.Help",
        "links": [
          {
            "description": "Request a higher quota limit.",
            "url": "https://cloud.google.com/docs/quotas/help/request_increase"
          }
        ]
      }
    ]
  }
}
```

`Retry-After` のヘッダーは、付いていなかった。

プロジェクト全体の 1 分あたりの上限(Queries per minute)を下げたときも、同じ形で返ってきた。
違ったのは、上限の名前にあたる所(`message` の中の名前と、`metadata` の `quota_limit`)だけである。

Google の[公式ドキュメント](https://developers.google.com/workspace/calendar/api/guides/errors)を読み直すと、利用制限は 403 でも 429 でも返ると書いてあった。
429 しか返らないと思っていたのは、こちらの思い込みだった。
ただ、公式ドキュメントの例には `status` も `details` も載っていない。
本物の応答に `PERMISSION_DENIED` が付くことは、当ててみるまで分からなかった。

## 権限不足との見分け

この応答で困るのは、`status` が権限不足のときと同じ言葉になる点である。

このアプリは、403 で `PERMISSION_DENIED` が返ると、Google との連携が切れたと判断して、利用者に連携し直しを求める。
利用制限をこの判定に通すと、1 分待てば直る失敗なのに、連携し直しを求めてしまう。
連携し直しても、制限は解けない。

幸い、理由の言葉(`rateLimitExceeded`)を先に見る順番になっていたので、取り違えてはいなかった。
ただ、見分けの根拠は、その言葉 1 つだけだった。
Google がこの言葉を変えると、その日から権限不足として扱ってしまう。

そこで、同じ応答に入っているほかの手がかりも使うことにした。

- `errors` の `domain` が `usageLimits` なら、理由の言葉を知らなくても、利用制限として扱う
- `details` の `reason` が `RATE_LIMIT_EXCEEDED` なら、分単位の制限として扱う

どちらも、権限不足かどうかを見る前に確かめる。
429 が返ったときは、本文を見るまでもなく、利用制限として扱っている。
理由の言葉を知らない制限は、失敗としては一時的なものに分けるが、すぐには送り直さない。
どれくらい待てば解けるのかが、分からないからである。

## 待ってから送り直すときの長さ

今回確かめた応答には `Retry-After` がなかったので、待つ長さは自分で決めることになる。
1 秒、2 秒、4 秒と延ばしながら、3 回まで送り直すようにした。
同じときに断られた端末が同じときに送り直さないよう、それぞれに 1 秒までのばらつきを足している。

本物の Google で試すと、断られた直後の通信は、3 回待ったあとに通った。
ただ、いつもこれで通るわけではない。
プロジェクト全体の上限を下げて続けて送ったときは、12 件のうち 5 件が、3 回送り直しても通らなかった。

通るかどうかは、断られたのが 1 分の枠のどのあたりだったかで決まるように見えた。
上の応答の `metadata` には、`window_start_time` という値が入っている。
続けて 2 回試すと、この値は 1794794980 と 1794795040 で、ちょうど 60 違っていた。
Unix 時刻の秒だとすると、枠は 60 秒ごとに切り替わっている(2 回だけの観測なので、推測である)。

そうであれば、枠の終わりが近いときに断られた通信は、数秒待つうちに次の枠に入って通る。
枠の始めに使い切ったときは、次の枠まで最長で 1 分近く、何度送っても通らない。

合わせて 8 秒ほどの待ちで足りるのは、前の場合と、Google の側の一時的な不調のときに限られる。
後の場合は、送り直しを打ち切って、次の同期に回している。
利用者を 1 分待たせるより、そのほうがよいと判断した。

## バッチの中でも、同じ形で返ってきた

複数の通信を 1 つにまとめて送るバッチでも試した。
利用者ごとの上限を 20 件に下げたまま、カレンダーの一覧を読む通信を 30 件まとめて送ると、バッチそのものは 200 で返ってきた。
中の 30 件には 1 件ずつ結果が付いていて、12 件が 200、18 件が 403 だった。
403 の本文は、1 件ずつ送ったときと同じ形をしていた。見分け方は、そのまま使える。

通った分と断られた分は、送った順ではなく、ばらばらに混ざっていた。
先頭から何件かが通る、とは考えられない。

Google の[公式ドキュメント](https://developers.google.com/workspace/calendar/api/guides/batch)にあるとおり、まとめた通信も、上限に対しては 1 件ずつ数えられる。
一度に送る分、1 分あたりの上限にはかえって早く届くので、利用制限を避ける手段にはならない。

## カレンダーを作りすぎたときの制限

API の通信の数とは別に、カレンダーの使いすぎを防ぐ制限がある。
テストでカレンダーを続けて作りすぎたときに、1 度当たった。
このときも 403 が返ったが、本文の形は違っていた。

```json
{
  "error": {
    "errors": [
      {
        "domain": "usageLimits",
        "reason": "quotaExceeded",
        "message": "Calendar usage limits exceeded."
      }
    ],
    "code": 403,
    "message": "Calendar usage limits exceeded."
  }
}
```

`status` も `details` も付いていない。
分単位の制限と共通しているのは、`domain` が `usageLimits` という点だけである。
翌日には、解けていた。

`reason` が何であっても、`domain` が `usageLimits` なら利用制限として扱うようにしておけば、応答の形がこのように違っても、利用制限だと分かる。

`Retry-After` が付く場面があるかは、確かめていない。

偽物の応答で書いたテストは、応答の形についての思い込みまで、そのまま写してしまう。
本物を 1 度見てから、その形をテストに写すことにした。
