# Firebase 배포와 Google 로그인

프로젝트: `guitar-juno`  
프로덕션 URL: <https://guitar-juno.web.app>  
대체 URL: <https://guitar-juno.firebaseapp.com>

## 현재 구성

- Firebase Web SDK: `src/lib/firebase.ts`
- Hosting 정적 파일: `dist` (`firebase.json`)
- Google 로그인: Firebase Authentication의 `signInWithPopup` + `GoogleAuthProvider`
- Google 제공업체: 클라우드에서 `enabled: true`, OAuth 클라이언트 생성 확인
- 로그인 상태: Firebase SDK의 기본 브라우저 지속성 + `onAuthStateChanged`
- 사용자 설정: Cloud Firestore의 `users/{uid}/preferences/main`
- Firestore: 서울 `asia-northeast3`, Standard edition, 무료 할당량 적용 데이터베이스
- 마이크 입력: 브라우저 내부에서만 처리. Firebase에 오디오를 저장하거나 전송하지 않음

Firebase 웹 구성의 `apiKey`, `appId`는 공개 클라이언트 식별자다. 서비스 계정 비밀키·관리자 토큰은 저장소에 넣지 않는다. 실제 데이터 권한은 `firestore.rules`에서 제한한다.

## Google 로그인 구성

이 프로젝트는 Firebase Management의 무료 Authentication 프로비저닝으로 Google 제공업체와 OAuth 클라이언트를 생성했다. 작업 완료 후 관리 API에서 Google 제공업체의 `enabled: true`와 클라이언트 구성이 존재하는 것을 확인했다. 결제 계정을 연결하거나 유료 Identity Platform으로 업그레이드하지 않았다. **현재 프로젝트에서 별도 Console 초기화 작업은 필요하지 않다.**

배포 사이트에서 **Google 로그인**을 눌러 로그인·새로고침 후 상태 유지·로그아웃을 확인할 수 있다. 실제 Google 계정 로그인 흐름은 브라우저 조작이 불가능한 개발 환경에서 자동 검증하지 못했다. 구현에 테스트 계정이나 사용자 비밀번호를 넣지 않는다.

향후 다른 Firebase 프로젝트로 옮길 때는 [공식 Authentication CLI](https://firebase.google.com/docs/auth/configure-providers-cli)의 `firebase init auth`와 `firebase deploy --only auth`로 Google 제공업체를 설정할 수 있다. Console을 사용하는 경우 [Authentication](https://console.firebase.google.com/project/guitar-juno/authentication)의 **로그인 방법 → Google**에서 관리한다.

기본 배포 도메인인 `guitar-juno.web.app`, `guitar-juno.firebaseapp.com`은 승인된 도메인에 포함되어 있다. 로컬에서 로그인하려면 `localhost`도 승인한다. 커스텀 도메인을 추가하는 경우 Authentication의 승인된 도메인과 OAuth 리디렉션 설정도 확인한다.

## 설정 저장과 권한

`loadPreferences(uid)`와 `savePreferences(uid, settings)`는 현재 로그인한 계정의 UID만 받는다. 문서에는 `schemaVersion`, `settings`, 서버의 `updatedAt`만 저장한다. 삭제한 즐겨찾기가 다시 나타나지 않도록 설정 맵 전체를 교체한다.

Firestore 규칙은 본인 문서의 읽기·쓰기만 허용한다. 목록 조회, 다른 사용자 문서, 다른 경로의 문서는 모두 거부한다. 계정 설정 로드가 실패하면 UI는 오류를 표시하고 기기의 로컬 설정을 유지할 수 있다. 계정 변경 시 이전 사용자의 로컬 설정을 새 계정에 자동 업로드하지 않도록 UI에서 구분한다.

## 로컬 실행과 배포

```sh
npm install
npm run dev
npm run build
npx firebase-tools deploy --only hosting,firestore:rules --project guitar-juno
```

Firebase CLI는 `firebase login`으로 배포 권한이 있는 계정에 로그인해야 한다. 사용자에게 제공된 Firebase 클라이언트 API 키만으로는 Hosting을 배포하거나 관리 설정을 변경할 수 없다.

Hosting은 Google 로그인 팝업을 위해 `Cross-Origin-Opener-Policy: same-origin-allow-popups`를 사용한다. `Permissions-Policy`는 같은 출처의 마이크만 허용하며 카메라·위치는 막는다. SPA 경로는 `/index.html`로 다시 쓴다.

## 오류 진단

| 오류 | 확인할 항목 |
| --- | --- |
| `auth/configuration-not-found` | Console에서 Authentication 최초 시작 완료 여부 |
| `auth/operation-not-allowed` | Google 로그인 제공업체 활성화 여부 |
| `auth/unauthorized-domain` | 현재 접속 도메인이 승인된 도메인에 등록되어 있는지 |
| `auth/popup-blocked` | 버튼 클릭에서 직접 팝업을 열었는지, 브라우저 팝업 설정 |
| `auth/popup-closed-by-user` | 사용자가 로그인 팝업을 닫은 경우. 재시도 가능 |
| Firestore `permission-denied` | 현재 UID와 경로가 일치하는지, 최신 규칙이 배포되었는지 |

## 공식 레퍼런스

- [Google 로그인 구현](https://firebase.google.com/docs/auth/web/google-signin)
- [인증 상태 관찰](https://firebase.google.com/docs/auth/web/manage-users)
- [OAuth 제공업체 관리 REST API](https://firebase.google.com/docs/auth/configure-oauth-rest-api)
- [Authentication 제공업체 CLI 구성](https://firebase.google.com/docs/auth/configure-providers-cli)
- [Firestore 보안 규칙](https://firebase.google.com/docs/firestore/security/rules-conditions)
- [Firebase Hosting 빠른 시작](https://firebase.google.com/docs/hosting/quickstart)
