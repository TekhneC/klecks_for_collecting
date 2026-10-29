export type AdminPassword = {
    salt: string;
    hash: string;
};

export function isAdminPassword(value: unknown): value is AdminPassword {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const record = value as { salt?: unknown; hash?: unknown };
    return typeof record.salt === 'string' && record.salt.length > 0 && typeof record.hash === 'string' && record.hash.length > 0;
}

export function randomSalt(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return hex(bytes);
}

export async function passwordHash(password: string, salt: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}\n${password}`));
    return hex(new Uint8Array(digest));
}

function hex(bytes: Uint8Array): string {
    return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}
