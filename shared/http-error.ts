export class HttpError extends Error {
    status: number;
    headers?: HeadersInit;

    constructor(status: number, message: string, headers?: HeadersInit) {
        super(message);
        this.name = "HttpError";
        this.status = status;
        this.headers = headers;
    }
}
