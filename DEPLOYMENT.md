# AWS Lambda Deployment Guide

This guide will help you deploy your Django Prayer App to AWS Lambda using Zappa.

## Prerequisites

1. **AWS Account**: Make sure you have an AWS account with appropriate permissions
2. **AWS CLI**: Install and configure AWS CLI
3. **Python 3.9**: Ensure you're using Python 3.9 (Lambda runtime)
4. **Virtual Environment**: Always use a virtual environment

## Step-by-Step Deployment

### 1. AWS Setup

First, configure your AWS credentials:

```bash
aws configure
```

You'll need:
- AWS Access Key ID
- AWS Secret Access Key  
- Default region (e.g., us-east-1)
- Default output format (json)

### 2. Environment Setup

```bash
# Activate your virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create your environment file
cp .env.example .env
# Edit .env with your actual values
```

### 3. Local Testing

Before deploying, test locally:

```bash
# Run setup
python deploy.py setup

# Start development server
python manage.py runserver
```

### 4. Configure Zappa Settings

Edit `zappa_settings.json` and update:

- `s3_bucket`: Must be globally unique (change "zappa-prayer-app-dev")
- `aws_region`: Your preferred AWS region
- `environment_variables`: Your actual secret keys and settings

### 5. Deploy to AWS Lambda

For development:
```bash
python deploy.py dev
```

For production:
```bash
python deploy.py prod
```

### 6. Database Setup (Production)

For production, you'll need Amazon RDS:

1. **Create RDS PostgreSQL Database**:
   ```bash
   aws rds create-db-instance \
     --db-instance-identifier prayer-app-db \
     --db-instance-class db.t3.micro \
     --engine postgres \
     --master-username admin \
     --master-user-password YourPassword123 \
     --allocated-storage 20
   ```

2. **Update Environment Variables**:
   Add these to your Zappa settings or AWS Lambda environment:
   ```
   DB_NAME=prayer_app_db
   DB_USER=admin
   DB_PASSWORD=YourPassword123
   DB_HOST=your-rds-endpoint.amazonaws.com
   DB_PORT=5432
   ```

3. **Run Migrations on Lambda**:
   ```bash
   zappa manage production migrate
   ```

### 7. Static Files Setup (S3)

1. **Create S3 Bucket for Static Files**:
   ```bash
   aws s3 mb s3://your-static-files-bucket
   ```

2. **Update Environment Variables**:
   ```
   AWS_STORAGE_BUCKET_NAME=your-static-files-bucket
   AWS_S3_REGION_NAME=us-east-1
   ```

3. **Upload Static Files**:
   ```bash
   python manage.py collectstatic
   zappa save-python-settings-file production
   ```

## Important Configuration Notes

### Memory and Timeout
- **Development**: 512MB memory, 30s timeout
- **Production**: 1024MB memory, 30s timeout
- Adjust based on your needs in `zappa_settings.json`

### Environment Variables
Never store sensitive data in your code. Use:
- AWS Lambda Environment Variables
- AWS Systems Manager Parameter Store
- AWS Secrets Manager

### CORS Configuration
If you need CORS support, add to your Django settings:
```python
CORS_ALLOWED_ORIGINS = [
    "https://yourdomain.com",
    "https://www.yourdomain.com",
]
```

## Common Commands

```bash
# Deploy for first time
zappa deploy dev

# Update existing deployment
zappa update dev

# Check status
zappa status dev

# View logs
zappa tail dev

# Run Django management commands
zappa manage dev migrate
zappa manage dev createsuperuser
zappa manage dev collectstatic

# Undeploy (delete everything)
zappa undeploy dev
```

## Troubleshooting

### Common Issues:

1. **Import Errors**: Make sure all dependencies are in requirements.txt
2. **Permission Errors**: Check AWS IAM permissions
3. **Database Connection**: Ensure RDS security groups allow Lambda access
4. **Static Files**: Verify S3 bucket permissions and CORS settings
5. **Memory Issues**: Increase memory_size in zappa_settings.json

### Debugging:

```bash
# View recent logs
zappa tail dev --since 1h

# Enable debug mode temporarily
zappa update dev --debug

# Check function configuration
aws lambda get-function --function-name prayer-app-dev
```

## Security Checklist

- [ ] Change default SECRET_KEY
- [ ] Set DEBUG=False in production
- [ ] Configure ALLOWED_HOSTS properly
- [ ] Use HTTPS only
- [ ] Set up proper IAM roles
- [ ] Enable AWS CloudTrail logging
- [ ] Use AWS Secrets Manager for sensitive data

## Cost Optimization

- Use AWS Lambda free tier (1M requests/month)
- Configure appropriate memory allocation
- Set up CloudWatch alarms for monitoring
- Use RDS on-demand or reserved instances

## Custom Domain (Optional)

To use a custom domain:

1. Configure in `zappa_settings.json`:
   ```json
   "domain": "api.yourdomain.com",
   "certificate_arn": "arn:aws:acm:us-east-1:123456789:certificate/..."
   ```

2. Deploy with domain:
   ```bash
   zappa certify production
   ```

## Support

For issues:
1. Check Zappa documentation: https://github.com/spulec/Zappa
2. AWS Lambda documentation
3. Django deployment best practices 