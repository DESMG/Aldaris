import { LinearProgress, Stack, Typography } from "@mui/material";

export default function PasswordStrength({ password }: { password: string }) {
    if (!password) return null;
    const variety = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter(pattern => pattern.test(password)).length;
    const repeated = /^(.)\1+$/.test(password);
    const score = repeated ? 0 : Math.min(3, Number(password.length >= 10) + Number(password.length >= 14) + Number(variety >= 3));
    const label = ["弱", "一般", "较强", "强"][score];
    const color = score < 1 ? "error" : score < 2 ? "warning" : "success";
    return <Stack spacing={0.5}>
        <LinearProgress variant="determinate" value={(score + 1) * 25} color={color} />
        <Typography variant="caption" color="text.secondary">密码强度：{label} (仅按长度与字符组合估计，不拦截弱密码)</Typography>
    </Stack>;
}
