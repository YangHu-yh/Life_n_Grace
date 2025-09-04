#!/usr/bin/env python3
"""
Deployment script for AWS Lambda using Zappa
"""

import os
import sys
import subprocess
from pathlib import Path

def run_command(command, description):
    """Run a shell command and handle errors"""
    print(f"\n{'='*50}")
    print(f"Running: {description}")
    print(f"Command: {command}")
    print(f"{'='*50}")
    
    result = subprocess.run(command, shell=True, capture_output=True, text=True)
    
    if result.returncode == 0:
        print("✅ Success!")
        if result.stdout:
            print("Output:", result.stdout)
    else:
        print("❌ Error!")
        if result.stderr:
            print("Error:", result.stderr)
        return False
    return True

def check_requirements():
    """Check if all required tools are installed"""
    print("Checking requirements...")
    
    # Check if AWS CLI is configured
    if not run_command("aws sts get-caller-identity", "Checking AWS CLI configuration"):
        print("❌ AWS CLI not configured. Run 'aws configure' first.")
        return False
    
    # Check if virtual environment is active
    if not hasattr(sys, 'real_prefix') and not sys.base_prefix != sys.prefix:
        print("❌ Virtual environment not activated. Run 'source venv/bin/activate' first.")
        return False
    
    return True

def collect_static():
    """Collect static files"""
    print("Collecting static files...")
    return run_command("python manage.py collectstatic --noinput", "Collecting static files")

def install_dependencies():
    """Install Python dependencies"""
    print("Installing dependencies...")
    return run_command("pip install -r requirements.txt", "Installing dependencies")

def run_migrations():
    """Run database migrations (for local testing)"""
    print("Running migrations...")
    return run_command("python manage.py migrate", "Running migrations")

def deploy_dev():
    """Deploy to development environment"""
    print("Deploying to development environment...")
    
    if not run_command("zappa deploy dev", "Deploying to dev"):
        print("Deploy failed, trying update instead...")
        return run_command("zappa update dev", "Updating dev deployment")
    return True

def deploy_production():
    """Deploy to production environment"""
    print("Deploying to production environment...")
    
    if not run_command("zappa deploy production", "Deploying to production"):
        print("Deploy failed, trying update instead...")
        return run_command("zappa update production", "Updating production deployment")
    return True

def main():
    """Main deployment function"""
    if len(sys.argv) < 2:
        print("Usage: python deploy.py [dev|prod|setup]")
        print("  dev    - Deploy to development")
        print("  prod   - Deploy to production") 
        print("  setup  - Setup local environment")
        sys.exit(1)
    
    command = sys.argv[1].lower()
    
    if command == "setup":
        print("Setting up local environment...")
        if install_dependencies() and run_migrations() and collect_static():
            print("✅ Setup complete!")
        else:
            print("❌ Setup failed!")
    
    elif command == "dev":
        if not check_requirements():
            sys.exit(1)
        
        if collect_static() and deploy_dev():
            print("✅ Development deployment complete!")
            print("\nTo run migrations on Lambda:")
            print("zappa manage dev migrate")
        else:
            print("❌ Development deployment failed!")
    
    elif command == "prod":
        if not check_requirements():
            sys.exit(1)
        
        if collect_static() and deploy_production():
            print("✅ Production deployment complete!")
            print("\nTo run migrations on Lambda:")
            print("zappa manage production migrate")
        else:
            print("❌ Production deployment failed!")
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)

if __name__ == "__main__":
    main() 