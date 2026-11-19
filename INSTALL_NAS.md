# 찰랑찰랑 예약 – NAS 설치 안내 (시놀로지 / UGREEN)

설치 방법은 두 가지입니다.

- **방법 A – Docker Hub 이미지 사용 (권장, 가장 간단)**: 이미 만들어진 이미지 `codeboxdocker/chalang-salon`을 받아 실행합니다. 파일 하나(`docker-compose.yml`)만 있으면 됩니다.
- **방법 B – 소스로 직접 빌드**: 압축 파일의 `Dockerfile`로 NAS가 이미지를 직접 만듭니다(아래 0~2장).

이미지는 인텔/AMD(amd64)와 ARM(arm64) 모두 제공되어, NAS 기종에 맞는 것이 자동으로 받아집니다.

---

## A. Docker Hub 이미지로 설치 (권장)

1. PC에서 `docker-compose.hub.yml`을 메모장으로 열어 **`SETUP_CODE` 값을 우리 가게만 아는 값으로 바꾸고**, 이름을 `docker-compose.yml`로 저장합니다. (포트 8080이 이미 쓰이면 왼쪽 숫자 변경)
2. NAS의 `docker` 공유 폴더 안에 `chalang-salon` 폴더를 만들고 이 파일 **하나만** 올립니다.
3. 프로젝트 생성
   - **시놀로지**: Container Manager → 프로젝트 → 생성 → 경로 `/docker/chalang-salon` → "기존 docker-compose.yml 사용" → 다음 → 웹 포털 건너뜀 → 완료
   - **UGREEN**: Docker 앱 → 프로젝트 → 생성 → 경로 `chalang-salon` 폴더, compose 내용 확인 → 배포
   - **SSH**: `cd /volume1/docker/chalang-salon && sudo docker compose up -d`
4. 이미지를 받은 뒤(1분 내외) `http://NAS주소:8080` 접속 → 설치 코드 + 관리자 계정 입력.
5. https 주소 만들기는 아래 **1-2(시놀로지) / 2-2(UGREEN)**와 같습니다.

**업데이트** (데이터는 그대로 유지)
- 시놀로지: Container Manager → 프로젝트 → `chalang-salon` → 정지 → **작업 → 빌드**(새 이미지를 받음) → 시작
  - 또는 **이미지** 메뉴에서 `codeboxdocker/chalang-salon` → 업데이트 가능 표시가 있으면 **업데이트**
- UGREEN: Docker 앱 → 이미지 → 다시 받기(Pull) → 프로젝트 재배포
- SSH: `sudo docker compose pull && sudo docker compose up -d`

> `latest` 대신 `codeboxdocker/chalang-salon:1.0.0`처럼 버전을 적어 두면, 업데이트 후 문제가 있을 때 이전 버전 번호로 바꿔 되돌릴 수 있습니다.

---

# 방법 B – 소스로 직접 빌드

NAS의 Docker 기능이 `Dockerfile`로 이미지를 직접 만들고(빌드) 실행합니다.

---

## 0. 공통 준비 (PC에서)

1. `chalang-salon-nas.zip` 압축을 풉니다. 안에 다음이 있어야 합니다.
   ```
   chalang-salon/
   ├─ Dockerfile
   ├─ docker-compose.yml
   ├─ docker/entrypoint.sh
   └─ src/ (프로그램 파일)
   ```
2. **`docker-compose.yml`을 메모장으로 열어 `SETUP_CODE` 값을 바꿉니다.**
   ```yaml
   SETUP_CODE: "우리가게만아는코드"
   ```
   처음 관리자 계정을 만들 때 이 코드를 입력해야 합니다.
   → 주소를 먼저 알게 된 다른 사람이 관리자가 되는 것을 막습니다.
3. 포트 `8080`이 NAS에서 이미 쓰이고 있다면 `"8080:80"`의 왼쪽 숫자를 다른 번호(예: `8090`)로 바꿉니다.

> 데이터(DB·로고)는 `chalang-salon/data` 폴더에 저장됩니다. 이 폴더를 NAS 백업에 꼭 포함하세요.

---

## 1. 시놀로지 NAS (DSM 7.2 이상, Container Manager)

> DSM 7.2 미만은 "Docker" 패키지를 사용하며, 프로젝트(compose) 빌드를 지원하지 않을 수 있습니다. 가능하면 DSM을 7.2 이상으로 업데이트하세요.

### 1-1. 설치

1. **패키지 센터** → `Container Manager` 검색 → 설치
2. **File Station** → `docker` 공유 폴더(Container Manager 설치 시 자동 생성)를 엽니다.
3. `docker` 안에 `chalang-salon` 폴더를 만들고, 압축 푼 파일 전체(`Dockerfile`, `docker-compose.yml`, `docker`, `src`)를 업로드합니다.
4. **Container Manager** → 왼쪽 **프로젝트** → **생성**
   - 프로젝트 이름: `chalang-salon`
   - 경로: `/docker/chalang-salon` 선택
   - 소스: **"기존 docker-compose.yml 사용"**이 자동 선택됨 → **다음**
   - 웹 포털 설정(Web Station)은 **건너뜀** → **다음** → **완료**
5. 이미지 빌드가 시작됩니다(처음 2~5분). 프로젝트 상태가 **실행 중**이 되면 완료.
6. 브라우저에서 `http://NAS주소:8080` 접속 → 설치 코드 + 관리자 계정 입력.

### 1-2. HTTPS 주소 만들기 (휴대폰 공유 기능에 필요)

휴대폰의 **공유창(텍스트·이미지 공유)과 이미지 복사는 https 주소에서만** 동작합니다.

1. **제어판 → 외부 액세스 → DDNS**: `우리가게.synology.me` 같은 주소를 만듭니다. (이미 있으면 생략)
2. **제어판 → 보안 → 인증서**: 추가 → Let's Encrypt 인증서 받기 (위 주소, 또는 `salon.우리가게.synology.me`)
3. **제어판 → 로그인 포털 → 고급 → 역방향 프록시 → 생성**
   | 항목 | 소스 | 대상 |
   |---|---|---|
   | 프로토콜 | HTTPS | HTTP |
   | 호스트 이름 | `salon.우리가게.synology.me` (또는 DDNS 주소) | `localhost` |
   | 포트 | `443` (또는 `8443`) | `8080` |
   - **사용자 지정 머리글** 탭 → 생성 → `X-Forwarded-Proto` = `https` 추가
4. **제어판 → 보안 → 인증서 → 설정**에서 방금 만든 역방향 프록시 항목에 인증서를 지정
5. 공유기에서 443(또는 8443) 포트를 NAS로 **포트 포워딩**
6. 이제 `https://salon.우리가게.synology.me` 로 접속합니다.
   - 8080 포트는 외부에 열지 말고 NAS 내부용으로만 둡니다.

### 1-3. 업데이트 / 백업

- **업데이트**: 새 `src` 폴더로 덮어쓰기 → Container Manager → 프로젝트 → `chalang-salon` → **작업 → 빌드**(또는 정지 → 빌드 → 시작). `data` 폴더는 그대로 유지됩니다.
- **백업**: Hyper Backup 작업에 `docker/chalang-salon/data` 포함.
- **초기화**(모든 데이터 삭제): 프로젝트 정지 → `data` 폴더 안 파일 삭제 → 시작.

---

## 2. UGREEN NAS (UGOS Pro, Docker 앱)

### 2-1. 설치

1. **앱 센터** → `Docker` 설치
2. **파일** 앱 → `docker` 폴더(없으면 공유 폴더 하나를 만들어 사용)에 `chalang-salon` 폴더를 만들고 압축 푼 파일 전체를 업로드합니다.
3. **Docker** 앱 → **프로젝트(Project)** → **생성(Create)**
   - 프로젝트 이름: `chalang-salon`
   - 저장 경로: 방금 만든 `chalang-salon` 폴더 선택
   - Compose 설정: 폴더 안의 `docker-compose.yml`을 가져오거나, 그 내용을 붙여넣기
   - **배포(Deploy)** → 이미지 빌드 후 컨테이너가 실행됩니다(처음 2~5분).
4. 브라우저에서 `http://NAS주소:8080` 접속 → 설치 코드 + 관리자 계정 입력.

> Docker 앱 화면에서 빌드가 되지 않는 UGOS 버전이라면 SSH로 직접 실행하세요.
> 1. **제어판 → 터미널 → SSH 켜기**
> 2. PC에서 `ssh 관리자아이디@NAS주소` 접속 후
>    ```bash
>    cd /volume1/docker/chalang-salon      # 실제 폴더 경로에 맞게
>    sudo docker compose up -d --build
>    ```

### 2-2. HTTPS 주소 만들기

UGOS Pro 버전에 따라 기본 메뉴가 다릅니다. 아래 중 하나를 사용하세요.

- **(A) UGOS 제어판에 "역방향 프록시(Reverse Proxy)" 메뉴가 있는 경우**: 소스 `HTTPS / 도메인 / 443` → 대상 `HTTP / localhost / 8080` 으로 등록하고 인증서(Let's Encrypt)를 연결합니다.
- **(B) 메뉴가 없는 경우 – Nginx Proxy Manager 컨테이너 사용**
  1. Docker 앱 → 이미지 검색 `jc21/nginx-proxy-manager` 로 컨테이너(또는 프로젝트) 생성, 포트 `80`, `443`, `81` 연결
  2. `http://NAS주소:81` 관리 화면 → Proxy Hosts → Add
     - Domain: `salon.내도메인` / Forward: `http`, `NAS주소`, `8080`
     - SSL 탭: Let's Encrypt 인증서 요청, Force SSL 켜기
  3. 공유기에서 80·443 포트를 NAS로 포트 포워딩, 도메인(DDNS)이 NAS 공인 IP를 가리키도록 설정
- **(C) 포트를 열고 싶지 않다면**: Cloudflare Tunnel(`cloudflare/cloudflared` 컨테이너)로 `https://salon.내도메인` → `http://NAS주소:8080` 연결

### 2-3. 업데이트 / 백업

- **업데이트**: `src` 폴더 덮어쓰기 → Docker 앱 → 프로젝트 → `chalang-salon` → 재빌드(또는 SSH에서 `sudo docker compose up -d --build`)
- **백업**: UGOS 백업 작업에 `chalang-salon/data` 폴더 포함

---

## 3. 문제 해결

| 증상 | 해결 |
|---|---|
| "attempt to write a readonly database" / 저장이 안 됨 | NAS 폴더 권한 문제. `docker-compose.yml`의 `PUID`, `PGID` 주석을 풀고 NAS 사용자 번호를 넣은 뒤 재시작. (SSH에서 `id 내아이디` → `uid=1026 gid=100` 같은 값) |
| 8080 포트 충돌로 시작 안 됨 | `"8080:80"`의 왼쪽 번호 변경 후 재배포 |
| 휴대폰에서 공유 버튼이 복사로만 동작 | https 주소가 아님 → 위 HTTPS 설정 진행 |
| 카카오톡에서 열면 이상함 | 자동으로 외부 브라우저로 넘어갑니다. 안 되면 화면 위 「외부 브라우저로 열기」 |
| 관리자 비밀번호 분실 | 다른 관리자 계정으로 로그인해 계정 관리에서 재설정. 관리자가 한 명뿐이면 `data` 폴더를 지우고 처음부터 설치(모든 데이터 삭제) |

## 4. (선택) 이미지 파일로 옮기기

Docker가 설치된 PC에서 이미지를 만들어 NAS로 가져올 수도 있습니다. NAS CPU 종류와 맞춰야 합니다(대부분의 시놀로지 Plus 모델·UGREEN DXP 모델은 `amd64`).

```bash
docker buildx build --platform linux/amd64 -t chalang-salon:1.0 --load .
docker save chalang-salon:1.0 -o chalang-salon-1.0-amd64.tar
```

- 시놀로지: Container Manager → **이미지 → 추가 → 파일에서 추가** → tar 선택
- UGREEN: Docker → **이미지 → 가져오기(Import)** → tar 선택

가져온 뒤에는 `docker-compose.yml`에서 `build: .` 줄을 지우고 같은 방법으로 프로젝트를 만들면 됩니다.
