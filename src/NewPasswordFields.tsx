import { TextField, Typography } from "@mui/material";
import PasswordStrength from "./PasswordStrength";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../shared/limits";

export default function NewPasswordFields({ passwordName, passwordLabel, confirmLabel, password, confirmPassword, onPasswordChange, onConfirmPasswordChange, disabled, required, helperText }: {
    passwordName: string;
    passwordLabel: string;
    confirmLabel: string;
    password: string;
    confirmPassword: string;
    onPasswordChange: (password: string) => void;
    onConfirmPasswordChange: (password: string) => void;
    disabled: boolean;
    required: boolean;
    helperText?: string;
}) {
    return <>
        <TextField name={passwordName} value={password} onChange={event => onPasswordChange(event.target.value)} label={passwordLabel} type="password" autoComplete="new-password"
            required={required} helperText={helperText} disabled={disabled} slotProps={{ htmlInput: { minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH } }} />
        <TextField name="confirmPassword" value={confirmPassword} onChange={event => onConfirmPasswordChange(event.target.value)} label={confirmLabel} type="password" autoComplete="new-password"
            required={required} disabled={disabled} slotProps={{ htmlInput: { minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH } }} />
        <Typography variant="caption" color="text.secondary">密码长度为 {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} 个字符</Typography>
        <PasswordStrength password={password} />
    </>;
}
