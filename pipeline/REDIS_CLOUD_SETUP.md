# Redis Cloud Setup Guide

This guide will help you set up Redis Cloud free tier for your CasaLinger application.

## Step 1: Create Redis Cloud Account

1. Go to [Redis Cloud](https://redis.com/try-free/)
2. Click "Get Started for Free"
3. Sign up with your email or use Google/GitHub
4. Verify your email address

## Step 2: Create a Database

1. After logging in, click "Create Database"
2. Choose "Free" plan
3. Select your preferred cloud provider (AWS, GCP, Azure)
4. Choose a region close to your users
5. Click "Create Database"

## Step 3: Get Connection Details

1. Once your database is created, click on it
2. Go to the "Configuration" tab
3. Copy the following details:
   - **Host**: Your Redis Cloud endpoint (e.g., `redis-12345.us-east-1-1.ec2.cloud.redislabs.com`)
   - **Port**: Usually 6379
   - **Password**: Your database password

## Step 4: Configure Environment Variables

Create a `.env` file in the `pipeline` directory with the following variables:

```env
# Redis Cloud Configuration
REDIS_CLOUD_HOST=redis-15571.crce204.eu-west-2-3.ec2.redns.redis-cloud.com
REDIS_CLOUD_PORT=15571
REDIS_CLOUD_USERNAME=default
REDIS_CLOUD_PASSWORD=your-redis-cloud-password

# Database Configuration
DATABASE_URL=sqlite:///real_estate.db

# Other Configuration
FLASK_SECRET_KEY=your-secret-key-here
FLASK_ENV=development
```

## Step 5: Test Connection

1. Start your Flask application
2. Check the logs for Redis connection status
3. You should see: "✅ Redis Cloud connection established successfully"

## Benefits of Redis Cloud

### Free Tier Features:
- **30MB storage** (sufficient for caching)
- **30 connections** (good for development)
- **Global availability**
- **SSL encryption**
- **99.9% uptime SLA**

### Advantages over Local Redis:
- **No local installation required**
- **Persistent across deployments**
- **Better performance and reliability**
- **Automatic backups**
- **Monitoring and analytics**

## Troubleshooting

### Connection Issues:
1. **Check credentials**: Ensure host, port, and password are correct
2. **SSL settings**: Make sure `REDIS_CLOUD_SSL=true`
3. **Network**: Verify your network allows outbound connections
4. **Firewall**: Check if any firewall is blocking the connection

### Common Errors:
- **Connection timeout**: Increase timeout values in redis_config.py
- **SSL errors**: Ensure SSL is enabled for Redis Cloud
- **Authentication failed**: Double-check your password

## Fallback to Local Redis

If Redis Cloud is not configured, the application will automatically fall back to local Redis:
- Local Redis must be installed and running
- Default configuration: `localhost:6379`
- No SSL required for local setup

## Monitoring

### Redis Cloud Dashboard:
- Monitor memory usage
- View connection statistics
- Check performance metrics
- Set up alerts

### Application Logs:
- Connection status is logged on startup
- Cache hits/misses are logged during operation
- Errors are logged with details

## Security Best Practices

1. **Never commit credentials** to version control
2. **Use environment variables** for sensitive data
3. **Enable SSL** for production environments
4. **Regularly rotate passwords**
5. **Monitor access logs**

## Cost Optimization

### Free Tier Limits:
- **30MB storage**: Monitor usage in dashboard
- **30 connections**: Sufficient for most applications
- **No bandwidth limits**: Unlimited data transfer

### Upgrade When Needed:
- **Storage**: Upgrade when approaching 30MB limit
- **Connections**: Upgrade if you need more concurrent users
- **Performance**: Consider paid plans for production workloads 