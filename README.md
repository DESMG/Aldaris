# Aldaris

Aldaris 是一个 Issue Tracker System.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/DESMG/Aldaris)

## 初始化

这条SQL可以初始化一个密码为 `123456` 的管理员 `admin`，请务必修改密码。

```sql
INSERT INTO users (username, name, passwordHash, role, createdAt)
VALUES (
    'admin',
    '管理员',
    '$100000$9904aee505c2df5c4d567b5a8d05c74b8dd10baf2f885f172f5d7958815859df$d83c06c57797eaf27d759c9a2e0fc879$',
    'admin',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
```

也可以使用以下 JavaScript 生成自定义密码的哈希，再替换上面 SQL 中的 `passwordHash` 值。在 HTTPS 页面的浏览器开发者工具控制台运行，先将 `password` 改为自己的密码。每次运行都会生成随机盐，因此同一密码生成的哈希也会不同。

```js
const password = "替换为自己的密码";
const iterations = 100000;
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
);
const digest = new Uint8Array(await crypto.subtle.deriveBits({
    name: "PBKDF2", hash: "SHA-256", salt, iterations,
}, key, 256));
const digestHex = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
const saltHex = Array.from(salt, byte => byte.toString(16).padStart(2, "0")).join("");
console.log(`$${iterations}$${digestHex}$${saltHex}$`);
```
