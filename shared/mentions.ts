import { textLinks } from "./links";

export function mentionMatches(text: string) {
    const links = textLinks(text);
    return [...text.matchAll(/(?<![A-Za-z0-9_@.+-])@([A-Za-z][A-Za-z0-9]{0,31})(?= )/gu)]
        .filter(match => !links.some(link => match.index >= link.index && match.index < link.index + link.text.length));
}

export function mentionCandidates(text: string) {
    return mentionMatches(text).map(match => ({ index: match.index, username: match[1].toLowerCase() }));
}
