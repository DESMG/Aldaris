export function textLinks(text: string) {
    const links: { index: number; text: string; url: URL }[] = [];
    for (const match of text.matchAll(/https?:\/\/[^\s<>"']*[^\s<>"'?!.,:*_~]/giu)) {
        let value = match[0];
        if (value.endsWith(")")) {
            let balance = 0;
            for (const character of value) {
                if (character === "(") balance++;
                else if (character === ")") balance--;
            }
            if (balance < 0) {
                const trailing = value.match(/\)+$/u)![0].length;
                value = value.slice(0, -Math.min(-balance, trailing));
            }
        }
        value = value.replace(/&[A-Za-z0-9]+;$/u, "");
        let url: URL;
        try { url = new URL(value); }
        catch { continue; }
        if (url.protocol === "https:" || url.protocol === "http:") links.push({ index: match.index, text: value, url });
    }
    return links;
}
