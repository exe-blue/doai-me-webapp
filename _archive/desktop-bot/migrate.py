import os
import shutil
from pathlib import Path

# === 설정: 이동할 타겟 구조 ===
# "이동할_폴더명": "목표_위치"
MOVES = {
    # 1. APPS (실행 가능한 애플리케이션)
    "backend": "apps/backend",
    "client": "apps/web-client",
    "client-pc": "apps/desktop-bot",
    "dashboard": "apps/dashboard",
    "client-mobile": "apps/mobile",
    "android": "apps/mobile/android",
    "apk": "apps/mobile/apk",

    # 2. INFRA (설정 및 인프라)
    "nginx": "infra/nginx",
    "supabase": "infra/database/supabase",
    "migrations": "infra/database/migrations",
    
    # 3. DOCS (문서)
    # 개별 파일 이동 로직은 아래에서 별도 처리
    
    # 4. CONFIG (기타 도구 설정)
    ".sonarlint": "config/tools/sonarlint",
    ".sisyphus": "config/tools/sisyphus",
    ".vercel": "config/tools/vercel",
    ".vscode": "config/vscode",
}

def migrate():
    root = Path.cwd()
    print(f"🚀 Starting Migration at: {root}")

    # 1. 폴더 이동
    for src_name, dest_path_str in MOVES.items():
        src = root / src_name
        dest = root / dest_path_str
        
        if src.exists():
            print(f"📦 Moving: {src_name} -> {dest_path_str}")
            dest.parent.mkdir(parents=True, exist_ok=True)
            try:
                shutil.move(str(src), str(dest))
            except Exception as e:
                print(f"⚠️ Error moving {src_name}: {e}")
        else:
            print(f"pass: {src_name} not found.")

    # 2. Docker 관련 파일 이동 (infra/docker)
    docker_dest = root / "infra" / "docker"
    docker_dest.mkdir(parents=True, exist_ok=True)
    for file in root.glob("docker-compose*.yml"):
        print(f"🐳 Moving Docker file: {file.name}")
        shutil.move(str(file), str(docker_dest / file.name))

    # 3. 문서 파일 이동 (docs/archive)
    # 기존 docs가 있으면 유지, 없으면 생성
    docs_dest = root / "docs" / "archive"
    docs_dest.mkdir(parents=True, exist_ok=True)
    
    # 루트에 있는 md, txt 파일들을 docs/archive로 이동 (README 제외)
    for ext in ["*.md", "*.txt"]:
        for file in root.glob(ext):
            if file.name.lower() in ["readme.md", ".cursorrules", "package.json"]:
                continue
            # 이미 docs 폴더 안에 있는게 아니면 이동
            if "docs" not in file.parts:
                print(f"📄 Moving Doc: {file.name}")
                shutil.move(str(file), str(docs_dest / file.name))

    # 4. 빈 폴더 생성 (Packages)
    (root / "packages" / "ui").mkdir(parents=True, exist_ok=True)
    (root / "packages" / "core").mkdir(parents=True, exist_ok=True)
    (root / "packages" / "shared").mkdir(parents=True, exist_ok=True)

    print("\n✅ Migration Completed! Check your folder structure.")

if __name__ == "__main__":
    confirm = input("⚠️  This script will reorganize your folder structure. Proceed? (y/n): ")
    if confirm.lower() == 'y':
        migrate()
    else:
        print("Cancelled.")