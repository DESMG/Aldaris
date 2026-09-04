export default {
    fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/api/health" && request.method === "GET") {
            return Response.json({ status: "ok" });
        }

        return new Response("Not Found", { status: 404 });
    },
} satisfies ExportedHandler;
