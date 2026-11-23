import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

// Отдаёт единый HTML-файл приложения «Тайный Санта» по корневой ссылке сервера.
// Тот же файл доступен напрямую как /santa.html и работает даже без сервера.
export async function GET() {
  try {
    const file = await fs.readFile(
      path.join(process.cwd(), "public", "santa.html"),
      "utf8",
    );
    return new Response(file, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Не удалось загрузить страницу Тайного Санты 🎄", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
