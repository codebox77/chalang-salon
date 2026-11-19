# 찰랑찰랑 미용실 예약 관리

PHP + SQLite 로 만든 미용실 직원용 예약 관리 웹앱 (휴대폰 화면 우선).

## 실행 (Docker, php:apache 이미지)

**NAS(시놀로지·UGREEN) 설치는 [INSTALL_NAS.md](INSTALL_NAS.md) 참고.**

```bash
docker compose up -d --build                         # 소스로 빌드
docker compose -f docker-compose.hub.yml up -d       # Docker Hub 이미지 사용
```

Docker Hub 이미지: `codeboxdocker/chalang-salon` (amd64 / arm64)

- `http://서버:8080` 접속 → `docker-compose.yml`의 `SETUP_CODE`를 입력하고 첫 관리자 계정 생성
- DB(SQLite)·로고는 `./data` 폴더(컨테이너의 `/var/www/data`)에 저장됩니다.

## 보안

- 로그인 토큰: 256비트 난수, DB에는 해시만 저장, HttpOnly·SameSite 쿠키 (https면 Secure)
- 비밀번호: `password_hash`(bcrypt), 새 비밀번호 6자 이상
- 무차별 대입 방지: 같은 아이디 15분에 8회 / 같은 IP 30회 틀리면 15분 잠금
- 첫 관리자 생성은 설치 코드(`SETUP_CODE`) 필요 (Docker)
- 모든 변경 요청은 POST + 사용자 지정 헤더 확인(CSRF 방지), 모든 SQL은 prepared statement
- 보안 헤더: CSP(frame-ancestors none), X-Frame-Options, nosniff, Referrer-Policy
- 서버 오류 상세 내용은 사용자에게 보이지 않음 (서버 로그에만 기록)
- 휴대폰 분실 시: 설정 → 「다른 기기 모두 로그아웃」 또는 비밀번호 변경

## Docker Hub 배포 (GitHub Actions)

`.github/workflows/docker.yml`이 GitHub에서 이미지를 빌드(amd64 + arm64)해 Docker Hub에 올립니다.

처음 한 번:
1. Docker Hub(codeboxdocker) → Account settings → **Personal access tokens** → 새 토큰(Read & Write) 생성
2. GitHub 저장소 → Settings → Secrets and variables → Actions → **New repository secret** → 이름 `DOCKERHUB_TOKEN`, 값에 토큰
3. 이 폴더를 GitHub 저장소의 `main` 브랜치에 push

이후:
- `main`에 push → `codeboxdocker/chalang-salon:latest` 갱신
- 버전 배포: `git tag v1.0.1 && git push origin v1.0.1` → `:1.0.1`, `:1.0`, `:latest`
- GitHub → Actions 탭에서 진행 상황 확인, 수동 실행(Run workflow)도 가능

## 일반 웹호스팅에 올리기 (예: https://minsol.pe.kr/crcrm/)

`src/` 안의 파일(`.htaccess`, `img/` 포함)을 그대로 업로드하면 됩니다. PHP 8.1 이상 + pdo_sqlite 필요.

- DB는 앱 폴더 안 `data/` 에 자동 생성됩니다. `data/.htaccess` 로 웹 접근을 막고, DB 파일 이름에 임의 문자열을 붙여 추측할 수 없게 합니다.
- 처음부터 다시 시작하려면 서버의 `data/` 폴더를 지우면 됩니다 (모든 데이터 삭제).

## 휴대폰에서 쓰기

- 한 번 로그인하면 **비밀번호를 바꾸기 전까지** 그 기기에서 계속 로그인됩니다 (10년 쿠키, 서버 토큰).
- 비밀번호를 바꾸면(본인 또는 관리자가) 그 계정은 다른 모든 기기에서 로그아웃됩니다.
- 브라우저 메뉴의 "홈 화면에 추가"를 하면 앱처럼 쓸 수 있습니다.
- 텍스트/이미지 **공유·복사 버튼은 HTTPS 에서만** 휴대폰 공유창이 뜹니다. HTTP(내부 IP 접속 등)에서는 복사 또는 "길게 눌러 저장" 화면으로 대신합니다.

## 기능 요약

| 구분 | 내용 |
|---|---|
| 일정 | 직원별 시간표(빈 칸 누르면 그 시간으로 바로 예약) / 목록 보기, 주간 날짜 바, 겹침 경고 |
| 예약 | 고객 이름 자동완성(초성·전화번호·비슷한 이름), 기존 고객이면 연락처 자동 입력·최근 방문 표시, 시술 여러 개 선택 시 소요 시간 자동 합산, 담당자의 가능한 시작 시각 버튼 |
| 상태 | 임시/확정/변경됨/취소됨/통화함/문자 전송함 (관리자가 추가·수정·삭제·순서·색, '시간 차지' 여부) |
| 부재 | 지금부터 30분/1시간/2시간, 오전/오후/종일 빠른 등록 |
| 빈 시간 | 기간·담당·시술(소요 시간) 기준 계산, 시간대/시작 시각 표시, 골라서 텍스트·이미지 공유/복사 |
| 공유 | 예약 등록 직후 고객에게 텍스트/이미지/문자로 보내기. 기본 문구(관리자) + 개인 문구(각자) |
| 고객 | 같은 이름 = 같은 고객, 방문 횟수·며칠 만의 방문·평균 주기, 고객 메모, 전화/문자 버튼 |
| 관리자 | 미용실 이름·로고, 영업시간(요일별), 점심(기본 + 직원별), 고정 휴식, 시간당 휴식(분), 시간 단위, 시술 종류·소요 시간, 계정 추가/수정/삭제, 다른 사람 일정 수정 허용 여부, 변경 기록(로그) |

모든 텍스트 입력란에는 종류별 자동완성 목록(아래로 펼쳐지는 목록)이 붙어 있으며, 입력했던 값은 서버에 쌓여 다음 입력 때 다시 제안됩니다.

### 공유 문구에 쓸 수 있는 값

- 예약 안내: `{미용실} {고객} {날짜} {시간} {시작} {소요} {시술} {담당} {상태} {전화} {메모}`
- 빈 시간: `{미용실} {빈시간} {담당} {시술} {소요} {기간}`

## 파일 구성

```
Dockerfile, docker-compose.yml   소스 빌드용
docker-compose.hub.yml           Docker Hub 이미지용
.github/workflows/docker.yml     Docker Hub 자동 배포
src/index.php     화면 틀
src/app.js        프론트엔드 (Vanilla JS)
src/app.css       스타일
src/api.php       JSON API
src/lib.php       DB 스키마·기본값·인증
src/manifest.php  홈 화면 추가용
src/img/default_logo.png  기본 로고 (minsol.pe.kr/crcr/assets/img/logo.png)
```
