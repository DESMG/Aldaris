export const mentionRecords = `(SELECT json_group_array(json_object(
    'index', json_extract(candidate.value, '$.index'),
    'username', json_extract(candidate.value, '$.username'), 'userId', mentioned.id
)) FROM json_each(?) AS candidate JOIN users AS mentioned
    ON mentioned.id = json_extract(candidate.value, '$.userId')
        OR (json_extract(candidate.value, '$.userId') IS NULL
            AND mentioned.username = json_extract(candidate.value, '$.username'))
    WHERE json_extract(candidate.value, '$.userId') IS NOT NULL OR mentioned.deletedAt IS NULL)`;

export function mentionDetails(column: string) {
    return `(SELECT json_group_array(json_object(
        'index', json_extract(reference.value, '$.index'),
        'username', json_extract(reference.value, '$.username'), 'userId', mentioned.id,
        'name', mentioned.name, 'currentUsername', mentioned.username,
        'role', mentioned.role, 'deletedAt', mentioned.deletedAt
    )) FROM json_each(${column}) AS reference JOIN users AS mentioned
        ON mentioned.id = json_extract(reference.value, '$.userId'))`;
}
