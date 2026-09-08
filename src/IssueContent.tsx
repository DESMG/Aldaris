import { useEffect } from "react";
import type { ReactNode } from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import CachedImage from "./CachedImage";
import ZoomableImage from "./ZoomableImage";
import type { Mention } from "../shared/types";
import { textLinks } from "../shared/links";
import { forgetImage } from "./api";

export default function Content({ description, images, clearedImages = [], mentions = [] }: { description: string; images: string[]; clearedImages?: string[]; mentions?: Mention[] }) {
    useEffect(() => {
        for (const key of clearedImages) forgetImage(`/api/images/${key}`);
    }, [clearedImages]);
    function plainText(value: string, start: number) {
        let offset = 0;
        const result: ReactNode[] = [];
        for (const mention of mentions.filter(item => item.index >= start && item.index + item.username.length + 1 <= start + value.length).sort((a, b) => a.index - b.index)) {
            const index = mention.index - start;
            const text = value.slice(index, index + mention.username.length + 1);
            const label = mention.deletedAt ? "已删除用户" : `${mention.name} (@${mention.currentUsername}) · ${mention.role === "admin" ? "管理员" : "用户"}`;
            result.push(value.slice(offset, index), <Tooltip key={`mention-${mention.index}`} title={label}>
                <Box component="span" tabIndex={0} sx={{ color: "primary.main", fontWeight: 700 }}>{text}{mention.deletedAt ? " (已删除用户)" : ""}</Box>
            </Tooltip>);
            offset = index + text.length;
        }
        result.push(value.slice(offset));
        return result;
    }
    let offset = 0;
    const text: ReactNode[] = [];
    for (const match of textLinks(description)) {
        const { text: value, url } = match;
        text.push(...plainText(description.slice(offset, match.index), offset));
        const external = url.origin !== window.location.origin;
        text.push(<Box key={`link-${match.index}`} component="a" href={url.href} target={external ? "_blank" : undefined} rel={external ? "external noopener noreferrer nofollow" : undefined} sx={{ color: "primary.main" }}>{value}</Box>);
        offset = match.index + value.length;
    }
    text.push(...plainText(description.slice(offset), offset));
    return <Stack spacing={2}>
        {description && <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{text}</Typography>}
        {images.map((key, index) => clearedImages.includes(key) ? <Typography key={key} color="text.secondary">[图片已被清理]</Typography> : <ZoomableImage key={key}
            alt={`图片 ${index + 1}`}
            thumbnailSx={{ display: "block", maxWidth: "100%", maxHeight: 480, objectFit: "contain" }}
            renderImage={sx => <CachedImage src={`/api/images/${key}`} alt={`图片 ${index + 1}`} sx={sx} />}
        />)}
    </Stack>;
}
