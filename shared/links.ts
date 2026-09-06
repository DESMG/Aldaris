export function textLinks(text: string) {
    const links: { index: number; text: string; url: URL }[] = [];
    for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/giu)) {
        let value = match[0].replace(/[.,;!?，。；！？]+$/, "");
        while (value.endsWith(")") && value.split(")").length > value.split("(").length) value = value.slice(0, -1);
        let url: URL;
        try { url = new URL(value); }
        catch { continue; }
        if (url.protocol === "https:" || url.protocol === "http:") links.push({ index: match.index, text: value, url });
    }
    return links;
}
