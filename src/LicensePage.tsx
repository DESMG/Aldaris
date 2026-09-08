import { Button, Link, Paper, Stack, Typography } from "@mui/material";

export default function LicensePage() {
    return <Paper component="article" variant="outlined" sx={{ p: { xs: 2, sm: 4 }, overflowWrap: "anywhere" }}>
        <Stack spacing={2}>
            <Typography component="h1" variant="h4">开源许可</Typography>
            <Typography>Copyright © DESMG</Typography>
            <Typography>Aldaris 采用 GNU Affero General Public License 第 3 版 (AGPL-3.0-only) 授权，仅适用第 3 版，不包含后续版本。您可以依照许可证获取、修改和再分发本软件。</Typography>
            <Typography>在适用法律允许的范围内，本软件不提供任何担保，包括适销性或适合特定用途的默示担保，具体以以下许可证为准。</Typography>
            <Typography>本站使用条款不限制许可证授予您的软件权利。工单、评论和图片等用户提交内容不会仅因使用本软件而自动适用此许可证。第三方组件遵循各自的许可证。</Typography>
            <Typography><Link href="https://github.com/DESMG/Aldaris" target="_blank" rel="external noopener noreferrer nofollow">获取 Aldaris 源代码</Link></Typography>
            <Typography><Link href="https://github.com/DESMG/Aldaris/blob/main/LICENSE" target="_blank" rel="external noopener noreferrer nofollow">项目许可证全文</Link></Typography>
            <Typography><Link href="https://github.com/DESMG/Aldaris/blob/main/third_party/README.md" target="_blank" rel="external noopener noreferrer nofollow">第三方组件与许可链接</Link></Typography>
            <Button href="/#/" variant="contained" sx={{ alignSelf: "center" }}>我已知晓</Button>
        </Stack>
    </Paper>;
}
