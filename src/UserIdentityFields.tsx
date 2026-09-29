import { TextField } from "@mui/material";
import { NAME_MAX_LENGTH, USERNAME_MAX_LENGTH } from "../shared/limits";

type Identity = { name: string; username: string };

export default function UserIdentityFields({ value, onChange, disabled, nameAutoComplete, usernameAutoComplete }: {
    value: Identity;
    onChange: (value: Identity) => void;
    disabled: boolean;
    nameAutoComplete?: string;
    usernameAutoComplete?: string;
}) {
    return <>
        <TextField name="name" label="昵称" autoComplete={nameAutoComplete} value={value.name} onChange={event => {
            onChange({ ...value, name: event.target.value });
            event.target.setCustomValidity(Array.from(event.target.value).length > NAME_MAX_LENGTH ? "昵称最多 32 个字符。" : "");
        }} required disabled={disabled} slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH * 2 } }} helperText="中文真实姓名；重名用数字或减号加部门名区分，最多 32 字符" />
        <TextField name="username" label="用户名" autoComplete={usernameAutoComplete} value={value.username} onChange={event => onChange({ ...value, username: event.target.value })}
            required disabled={disabled} slotProps={{ htmlInput: { maxLength: USERNAME_MAX_LENGTH, pattern: "[A-Za-z]+[0-9]*" } }} helperText="本人姓名的英文拼音，重名在末尾加数字，最多 32 字符" />
    </>;
}
