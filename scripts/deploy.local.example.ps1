# Copy to deploy.local.ps1 (ignored) and fill in local/private values.
$DeployConfig = @{
    SshTarget = 'deploy@example-vps'
    IdentityFile = 'C:\path\to\private-key'
    RemoteAppRoot = '/srv/ptracker'
    PublicUrl = 'https://poker.example.com'
}
