#!/usr/bin/env python3
"""
Deployment script for AWS Lambda using Zappa
"""

import os
import sys
import subprocess
from pathlib import Path

FAILED_STEPS = []

def _tail(text: str, max_lines: int = 60) -> str:
    lines = (text or "").splitlines()
    if len(lines) <= max_lines:
        return "\n".join(lines)
    return "\n".join(lines[-max_lines:])

def run_command(command, description, env=None):
    """Run a shell command and handle errors"""
    print(f"\n{'='*50}")
    print(f"Running: {description}")
    print(f"Command: {command}")
    print(f"{'='*50}")
    
    result = subprocess.run(command, shell=True, capture_output=True, text=True, env=env)
    
    if result.returncode == 0:
        print("✅ Success!")
        if result.stdout:
            print("Output:", result.stdout)
    else:
        print("❌ Error! (exit code:", result.returncode, ")")
        if result.stdout:
            print("----- STDOUT -----\n" + _tail(result.stdout))
        if result.stderr:
            print("----- STDERR -----\n" + _tail(result.stderr))
        FAILED_STEPS.append({
            "description": description,
            "command": command,
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        })
        return False
    return True

def get_venv_paths():
    """Return paths for venv python and pip if venv exists, else fall back to system.
    This allows running installs/migrations without requiring the shell to activate venv.
    """
    project_root = Path(__file__).resolve().parent
    venv_python = project_root / "venv" / "bin" / "python"
    venv_pip = project_root / "venv" / "bin" / "pip"
    python_cmd = str(venv_python) if venv_python.exists() else sys.executable
    pip_cmd = str(venv_pip) if venv_pip.exists() else "pip"
    return python_cmd, pip_cmd

def ensure_venv():
    """Create a local venv if it doesn't exist."""
    project_root = Path(__file__).resolve().parent
    venv_dir = project_root / "venv"
    if venv_dir.exists():
        print("Virtual environment already exists at ./venv")
        return True
    return run_command(f"{sys.executable} -m venv venv", "Creating virtual environment at ./venv")

def get_zappa_cmd():
    """Return a callable Zappa command.
    Prefer the venv's 'zappa' executable, fall back to 'zappa' on PATH.
    """
    project_root = Path(__file__).resolve().parent
    venv_zappa = project_root / "venv" / "bin" / "zappa"
    if venv_zappa.exists() and os.access(venv_zappa, os.X_OK):
        return str(venv_zappa)
    return "zappa"

def get_venv_env():
    """Return an environment dict with VIRTUAL_ENV set and venv/bin preprended to PATH."""
    project_root = Path(__file__).resolve().parent
    venv_dir = project_root / "venv"
    venv_bin = venv_dir / "bin"
    env = os.environ.copy()
    env["VIRTUAL_ENV"] = str(venv_dir)
    env["PATH"] = f"{venv_bin}:{env.get('PATH','')}"
    # Ensure we don't leak a conflicting PYTHONHOME
    env.pop("PYTHONHOME", None)
    return env

def check_requirements():
    """Check if all required tools are installed"""
    print("Checking requirements...")
    
    # Check if AWS CLI is configured
    if not run_command("aws sts get-caller-identity", "Checking AWS CLI configuration"):
        print("❌ AWS CLI not configured. Run 'aws configure' first.")
        return False
    
    # Check if virtual environment is active (best-effort). We allow running via venv bin paths as well.
    venv_active = hasattr(sys, 'real_prefix') or (sys.base_prefix != sys.prefix)
    venv_paths_exist = (Path(__file__).resolve().parent / "venv" / "bin" / "python").exists()
    if not venv_active and not venv_paths_exist:
        print("❌ Virtual environment not detected. Create/activate venv or run 'python deploy.py bootstrap'.")
        return False
    
    return True

def collect_static():
    """Collect static files"""
    print("Collecting static files...")
    python_cmd, _ = get_venv_paths()
    return run_command(f"{python_cmd} manage.py collectstatic --noinput", "Collecting static files")

def install_dependencies():
    """Install Python dependencies"""
    print("Installing dependencies...")
    python_cmd, pip_cmd = get_venv_paths()
    return (
        run_command(f"{pip_cmd} install --upgrade pip setuptools wheel", "Upgrading pip and build tools") and
        run_command(f"{pip_cmd} install -r requirements.txt", "Installing dependencies")
    )

def run_migrations():
    """Run database migrations (for local testing)"""
    print("Running migrations...")
    python_cmd, _ = get_venv_paths()
    ok = run_command(f"{python_cmd} manage.py migrate --traceback", "Running migrations")
    if ok:
        return True

    # Detect a common local SQLite corruption: missing contenttypes table but migrations think applied
    # If so, reset local SQLite DB and retry once.
    try:
        marker = "no such table: django_content_type"
        hit = False
        for step in FAILED_STEPS:
            if step.get("description") == "Running migrations" and step.get("stderr") and marker in step.get("stderr"):
                hit = True
                break
        if hit:
            project_root = Path(__file__).resolve().parent
            sqlite_db = project_root / "db.sqlite3"
            if sqlite_db.exists():
                print("\n⚠️  Detected corrupted local SQLite schema (missing django_content_type). Resetting db.sqlite3 and retrying migrations once...")
                try:
                    sqlite_db.unlink()
                    print(f"Deleted: {sqlite_db}")
                except Exception as e:
                    print(f"Could not delete {sqlite_db}: {e}")
                # Retry migrate after reset
                return run_command(f"{python_cmd} manage.py migrate --traceback", "Running migrations (after reset)")
    except Exception:
        pass

    return False

def make_migrations():
    """Create new migrations for changed models."""
    print("Making migrations...")
    python_cmd, _ = get_venv_paths()
    return run_command(f"{python_cmd} manage.py makemigrations", "Creating migrations from model changes")

def update_migrations():
    """Make and apply migrations locally."""
    return make_migrations() and run_migrations()

def clean_caches():
    """Clean Python caches and pip caches to free space and avoid stale bytecode."""
    print("Cleaning caches and pip cache...")
    _, pip_cmd = get_venv_paths()
    steps = [
        ("find . -name \"__pycache__\" -type d -exec rm -rf {} + 2>/dev/null || true", "Removing __pycache__ directories"),
        ("find . -name '*.py[co]' -delete 2>/dev/null || true", "Removing *.pyc/*.pyo files"),
        ("find . -maxdepth 2 -type f -name '*.tar.gz' -delete 2>/dev/null || true", "Removing local *.tar.gz build archives"),
        ("rm -rf .pytest_cache .mypy_cache .ruff_cache || true", "Removing local tool caches"),
        (f"{pip_cmd} cache purge || true", "Purging pip cache (current environment)"),
        ("rm -rf ~/.cache/pip ~/Library/Caches/pip 2>/dev/null || true", "Removing user pip caches (if present)")
    ]
    for cmd, desc in steps:
        # Best-effort: report errors but don't fail the overall process on cache cleanup
        run_command(cmd, desc)
    return True

def deploy_dev():
    """Deploy to development environment"""
    print("Deploying to development environment...")
    zappa_cmd = get_zappa_cmd()
    env = get_venv_env()
    if not run_command(f"{zappa_cmd} deploy dev", "Deploying to dev", env=env):
        print("Deploy failed, trying update instead...")
        if not run_command(f"{zappa_cmd} update dev", "Updating dev deployment", env=env):
            return False
    # Post-deploy migrations (best-effort)
    run_command(f"{zappa_cmd} manage dev migrate", "Running migrations on dev", env=env)
    return True

def deploy_production():
    """Deploy to production environment"""
    print("Deploying to production environment...")
    zappa_cmd = get_zappa_cmd()
    env = get_venv_env()
    if not run_command(f"{zappa_cmd} deploy production", "Deploying to production", env=env):
        print("Deploy failed, trying update instead...")
        if not run_command(f"{zappa_cmd} update production", "Updating production deployment", env=env):
            return False
    # Post-deploy migrations (best-effort)
    run_command(f"{zappa_cmd} manage production migrate", "Running migrations on production", env=env)
    return True

def main():
    """Main deployment function"""
    if len(sys.argv) < 2:
        print("Usage: python deploy.py [dev|prod|setup|clean|migrate|bootstrap]")
        print("  dev        - Deploy to development")
        print("  prod       - Deploy to production") 
        print("  setup      - Setup local environment (assumes active venv)")
        print("  clean      - Clean Python caches and pip caches")
        print("  migrate    - Make and apply local migrations")
        print("  bootstrap  - One-shot: create venv, install, migrate, collectstatic")
        sys.exit(1)
    
    command = sys.argv[1].lower()
    
    if command == "setup":
        print("Setting up local environment...")
        if install_dependencies() and run_migrations() and collect_static():
            print("✅ Setup complete!")
        else:
            print("❌ Setup failed!")
    elif command == "clean":
        if clean_caches():
            print("✅ Cleaned caches.")
        else:
            print("❌ Cleaning caches encountered errors.")
            if FAILED_STEPS:
                print("\n===== Failure summary =====")
                for i, step in enumerate(FAILED_STEPS, 1):
                    print(f"\n[{i}] {step['description']}\nCommand: {step['command']}\nExit code: {step['returncode']}")
                    if step['stderr']:
                        print("---- STDERR (tail) ----\n" + _tail(step['stderr']))
                    if step['stdout']:
                        print("---- STDOUT (tail) ----\n" + _tail(step['stdout']))
            sys.exit(1)
    elif command == "migrate":
        if update_migrations():
            print("✅ Migrations updated locally.")
        else:
            print("❌ Migration update failed.")
            if FAILED_STEPS:
                print("\n===== Failure summary =====")
                for i, step in enumerate(FAILED_STEPS, 1):
                    print(f"\n[{i}] {step['description']}\nCommand: {step['command']}\nExit code: {step['returncode']}")
                    if step['stderr']:
                        print("---- STDERR (tail) ----\n" + _tail(step['stderr']))
                    if step['stdout']:
                        print("---- STDOUT (tail) ----\n" + _tail(step['stdout']))
            sys.exit(1)
    elif command == "bootstrap":
        print("Bootstrapping project: venv → install → migrate → collectstatic → clean caches")
        ok = True
        ok = ensure_venv() and ok
        if not ok:
            print("❌ Failed to create virtual environment.")
            sys.exit(1)
        ok = install_dependencies() and ok
        ok = update_migrations() and ok
        ok = collect_static() and ok
        clean_caches()
        if ok:
            print("✅ Bootstrap complete! If not already, activate venv: 'source venv/bin/activate'")
        else:
            print("❌ Bootstrap encountered errors.")
            if FAILED_STEPS:
                print("\n===== Failure summary =====")
                for i, step in enumerate(FAILED_STEPS, 1):
                    print(f"\n[{i}] {step['description']}\nCommand: {step['command']}\nExit code: {step['returncode']}")
                    if step['stderr']:
                        print("---- STDERR (tail) ----\n" + _tail(step['stderr']))
                    if step['stdout']:
                        print("---- STDOUT (tail) ----\n" + _tail(step['stdout']))
            sys.exit(1)
    
    elif command == "dev":
        if not check_requirements():
            sys.exit(1)
        
        if collect_static() and deploy_dev():
            print("✅ Development deployment complete!")
            print("\nTo run migrations on Lambda:")
            print(f"{get_zappa_cmd()} manage dev migrate")
        else:
            print("❌ Development deployment failed!")
            if FAILED_STEPS:
                print("\n===== Failure summary =====")
                for i, step in enumerate(FAILED_STEPS, 1):
                    print(f"\n[{i}] {step['description']}\nCommand: {step['command']}\nExit code: {step['returncode']}")
                    if step['stderr']:
                        print("---- STDERR (tail) ----\n" + _tail(step['stderr']))
                    if step['stdout']:
                        print("---- STDOUT (tail) ----\n" + _tail(step['stdout']))
            sys.exit(1)
    
    elif command == "prod":
        if not check_requirements():
            sys.exit(1)
        
        if collect_static() and deploy_production():
            print("✅ Production deployment complete!")
            print("\nTo run migrations on Lambda:")
            print(f"{get_zappa_cmd()} manage production migrate")
        else:
            print("❌ Production deployment failed!")
            if FAILED_STEPS:
                print("\n===== Failure summary =====")
                for i, step in enumerate(FAILED_STEPS, 1):
                    print(f"\n[{i}] {step['description']}\nCommand: {step['command']}\nExit code: {step['returncode']}")
                    if step['stderr']:
                        print("---- STDERR (tail) ----\n" + _tail(step['stderr']))
                    if step['stdout']:
                        print("---- STDOUT (tail) ----\n" + _tail(step['stdout']))
            sys.exit(1)
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)

if __name__ == "__main__":
    main() 