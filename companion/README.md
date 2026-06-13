# 레이밴 음성 질문 — 네이티브 컴패니언 골격

웹(`ask.html`)은 폰 브라우저에서 텍스트·음성(Web Speech API)으로 지금 작동합니다.
하지만 **렌즈 마이크로 음성 질문**은 Meta Wearables Device Access Toolkit의
**네이티브 경로(Swift/Kotlin)**가 필요합니다 — 마이크/오디오 딥 액세스가 모바일 SDK에 있기 때문.

> ⚠️ 이 디렉터리는 **동작 골격 + 매핑 가이드**입니다. 실제 빌드·테스트는
> Toolkit 프리뷰 + 실제 안경 + Xcode/Android Studio가 필요하므로 이 레포에서는 검증 불가.
> 정확한 API 시그니처는 https://wearables.developer.meta.com/docs/ 에서 확인하세요.

## 데이터 흐름 (음성)

```
레이밴 마이크 ──(Toolkit audio)──▶ 컴패니언 앱
   │  STT (온디바이스 또는 클라우드)
   ▼
POST {ASK_BACKEND}/ask  { question, target:"model"|"session" }
   │
   ▼  답변(JSON)
컴패니언 앱 ──(Toolkit display)──▶ 렌즈에 1~3문장 표시
```

`{ASK_BACKEND}`는 이 레포의 `backend/ask-server.mjs`와 동일한 엔드포인트입니다.
즉 **웹과 안경이 같은 백엔드를 공유** — 경로 A/B 로직을 한 번만 구현하면 됩니다.

## iOS (Swift) 골격

```swift
// Wearables Device Access Toolkit (iOS) — 개념 골격.
// 실제 타입/메서드명은 Toolkit 문서 확인.
import WearablesDeviceAccess   // TODO: 실제 모듈명 확인

let ASK_BACKEND = "https://your-backend.example.com"

func onVoiceButton() {
    // 1) 렌즈/안경 마이크에서 오디오 캡처 (Toolkit audio API)
    wearables.audio.startCapture { audioChunk in
        // 2) STT → 텍스트 (SFSpeechRecognizer 또는 외부 STT)
        speechToText(audioChunk) { question in
            ask(question: question, target: "model")   // 경로 A
        }
    }
}

func ask(question: String, target: String) {
    var req = URLRequest(url: URL(string: "\(ASK_BACKEND)/ask")!)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try? JSONSerialization.data(withJSONObject: ["question": question, "target": target])
    URLSession.shared.dataTask(with: req) { data, _, _ in
        guard let data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let answer = json["answer"] as? String else { return }
        // 3) 렌즈 디스플레이에 답 표시 (Toolkit display API)
        DispatchQueue.main.async { wearables.display.show(text: answer) }   // TODO: 실제 API
    }.resume()
}
```

## Android (Kotlin) 골격

```kotlin
// Wearables Device Access Toolkit (Android) — 개념 골격. 실제 타입/메서드명은 문서 확인.
const val ASK_BACKEND = "https://your-backend.example.com"

fun onVoiceButton() {
    wearables.audio.startCapture { audioChunk ->          // 1) 안경 마이크
        speechToText(audioChunk) { question ->            // 2) STT
            ask(question, target = "model")               // 경로 A
        }
    }
}

fun ask(question: String, target: String) {
    val body = JSONObject(mapOf("question" to question, "target" to target)).toString()
    // OkHttp 등으로 POST
    httpPost("$ASK_BACKEND/ask", body) { json ->
        val answer = json.optString("answer")
        runOnUiThread { wearables.display.showText(answer) }   // 3) 렌즈에 표시  // TODO: 실제 API
    }
}
```

## 구현 체크리스트
- [ ] Wearables Toolkit(iOS/Android) SDK 통합 — GitHub Packages/스타터킷 참고
- [ ] 자기 안경에 개발자 프리뷰 등록 (배포는 프리뷰 파트너만)
- [ ] 마이크 캡처 → STT (온디바이스 권장: 지연·프라이버시)
- [ ] `backend/ask-server.mjs` 배포 후 `ASK_BACKEND` 설정
- [ ] 렌즈 표시는 **1~3문장**으로 제한 (백엔드가 이미 짧게 답하도록 지시됨)
- [ ] 경로 B(세션 질문)는 polling 또는 푸시로 답 수신
