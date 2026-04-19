# SSH public keys (safe to commit)

Files here are **public** keys only (`*.pub`). They are not secret; the matching **private** key stays on your machine (`~/.ssh/id_ed25519`).

## Authorize on the server (one-time)

As root on the server (or use your password once):

```bash
mkdir -p /root/.ssh
chmod 700 /root/.ssh
cat >> /root/.ssh/authorized_keys
# paste the single line from salman.abuawad.pub, then Ctrl+D
chmod 600 /root/.ssh/authorized_keys
```

Or from your PC (password prompt once):

```bash
ssh-copy-id -i deploy/keys/salman.abuawad.pub root@YOUR_SERVER_IP
```

Then test:

```bash
ssh -i ~/.ssh/id_ed25519 root@YOUR_SERVER_IP
```

Use `./deploy/remote-deploy.sh` once key login works without a password.
