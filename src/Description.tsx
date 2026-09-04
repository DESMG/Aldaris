import { useEffect, useState } from "react";
import { Box, Button, Stack, TextField } from "@mui/material";

function ImagePreview({ file, alt }: { file: File; alt: string }) {
    const [url, setUrl] = useState<string>();
    useEffect(() => {
        const imageUrl = URL.createObjectURL(file);
        setUrl(imageUrl);
        return () => URL.revokeObjectURL(imageUrl);
    }, [file]);
    return <Box component="img" src={url} alt={alt} sx={{ display: "block", maxWidth: "100%", maxHeight: 320, objectFit: "contain" }} />;
}

export default function Description({ label, value, onChange, images, onImagesChange, disabled }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    images: File[];
    onImagesChange: (images: File[]) => void;
    disabled: boolean;
}) {
    return <Stack spacing={2}>
        <TextField
            label={label} multiline minRows={4} fullWidth disabled={disabled}
            slotProps={{ htmlInput: { maxLength: 20000 } }}
            value={value} onChange={(event) => onChange(event.target.value)}
            onPaste={(event) => {
                const pasted = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
                if (pasted.length > 0) onImagesChange([...images, ...pasted]);
            }}
        />
        {images.map((file, index) => <Box key={index}>
            <ImagePreview file={file} alt={`图片 ${index + 1}`} />
            <Button disabled={disabled} onClick={() => onImagesChange(images.filter((_, i) => i !== index))}>移除图片 {index + 1}</Button>
        </Box>)}
    </Stack>;
}
