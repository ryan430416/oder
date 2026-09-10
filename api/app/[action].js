import { handleAppAction } from "../../server/app-handlers.js";

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.status(405).json({ ok: false, code: "method_not_allowed" });
    return;
  }
  const action = String(request.query.action || "").trim();
  const authorization = request.headers.authorization || "";
  try {
    const result = await handleAppAction(action, {
      body: request.body && typeof request.body === "object" ? request.body : {},
      authorization,
    });
    response.status(200).json(result);
  } catch (error) {
    console.error("app action failed", action, error?.message);
    response.status(200).json({ ok: false, code: "backend_error" });
  }
}
