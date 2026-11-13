# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2026 ttttsdaf and contributors. See LICENSE and NOTICE.md.
"""Serve only explicitly listed demo, license and corresponding-source files."""

from __future__ import annotations

import argparse
import io
import socket
import sys
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Timer
from urllib.parse import urlsplit
from zipfile import ZIP_DEFLATED, ZipFile


PROJECT_ROOT = Path(__file__).resolve().parent
ROUTES = {
    "/": ("app/index.html", "text/html; charset=utf-8"),
    "/index.html": ("app/index.html", "text/html; charset=utf-8"),
    "/style.css": ("app/style.css", "text/css; charset=utf-8"),
    "/app.js": ("app/app.js", "text/javascript; charset=utf-8"),
    "/NOTICE.md": ("NOTICE.md", "text/plain; charset=utf-8"),
    "/LICENSE": ("LICENSE", "text/plain; charset=utf-8"),
    "/LICENSES/CC-BY-SA-4.0.txt": ("LICENSES/CC-BY-SA-4.0.txt", "text/plain; charset=utf-8"),
    "/data/scenarios.json": ("app/scenarios.json", "application/json; charset=utf-8"),
    "/data/methods.json": ("content/methods.json", "application/json; charset=utf-8"),
    "/data/example-record.json": (
        "content/example-record.json",
        "application/json; charset=utf-8",
    ),
}

SOURCE_FILES = (
    "app/index.html", "app/style.css", "app/app.js", "app/scenarios.json",
    "content/methods.json", "content/example-record.json", "serve.py",
    "start-preview.cmd", "LICENSE", "LICENSES/CC-BY-SA-4.0.txt", "NOTICE.md",
)


def corresponding_source() -> bytes:
    """Archive this instance's actual runtime sources; never enumerate the workspace."""
    buffer = io.BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        for relative in SOURCE_FILES:
            path = PROJECT_ROOT / relative
            if path.is_symlink() or not path.resolve().is_relative_to(PROJECT_ROOT):
                raise OSError("Source file is outside the allowed project")
            archive.write(path, arcname=relative)
    return buffer.getvalue()


class PreviewHandler(BaseHTTPRequestHandler):
    def _respond(
        self,
        status: int,
        content: bytes,
        content_type: str = "text/plain; charset=utf-8",
        *,
        head_only: bool = False,
        allow: str | None = None,
        attachment: str | None = None,
    ) -> None:
        self.send_response(status)
        if status != 204:
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if allow:
            self.send_header("Allow", allow)
        if attachment:
            self.send_header("Content-Disposition", f'attachment; filename="{attachment}"')
        self.end_headers()
        if not head_only and content:
            try:
                self.wfile.write(content)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _read(self, *, head_only: bool = False) -> None:
        try:
            request_path = urlsplit(self.path).path
        except ValueError:
            self._respond(404, b"Not found.\n", head_only=head_only)
            return

        if request_path == "/favicon.ico":
            self._respond(204, b"", head_only=head_only)
            return

        if request_path == "/source.zip":
            try:
                content = corresponding_source()
            except (OSError, RuntimeError):
                self._respond(503, b"Corresponding source is unavailable.\n", head_only=head_only)
                return
            self._respond(200, content, "application/zip", head_only=head_only,
                          attachment="method-navigation-source.zip")
            return

        route = ROUTES.get(request_path)
        if route is None:
            self._respond(404, b"Not found.\n", head_only=head_only)
            return

        relative_path, content_type = route
        try:
            file_path = (PROJECT_ROOT / relative_path).resolve()
            if not file_path.is_relative_to(PROJECT_ROOT):
                self._respond(404, b"Not found.\n", head_only=head_only)
                return
            content = file_path.read_bytes()
        except FileNotFoundError:
            self._respond(404, b"Preview file is not available yet.\n", head_only=head_only)
            return
        except (OSError, RuntimeError):
            self._respond(500, b"Unable to read the preview file.\n", head_only=head_only)
            return

        self._respond(200, content, content_type, head_only=head_only)

    def do_GET(self) -> None:
        self._read()

    def do_HEAD(self) -> None:
        self._read(head_only=True)

    def _reject_write(self) -> None:
        self._respond(405, b"This preview only supports GET and HEAD.\n", allow="GET, HEAD")

    do_POST = _reject_write
    do_PUT = _reject_write
    do_PATCH = _reject_write
    do_DELETE = _reject_write


class LocalPreviewServer(ThreadingHTTPServer):
    allow_reuse_address = False
    daemon_threads = True

    def server_bind(self) -> None:
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def parse_port(value: str) -> int:
    try:
        port = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("port must be an integer") from error
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("port must be between 1 and 65535")
    return port


def open_preview(url: str) -> None:
    try:
        opened = webbrowser.open(url, new=2)
    except Exception as error:
        print(f"Unable to open the browser: {error}. Open {url} manually.", file=sys.stderr, flush=True)
        return
    if not opened:
        print(f"Unable to open the browser. Open {url} manually.", file=sys.stderr, flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Local-only method navigation preview")
    parser.add_argument("--port", type=parse_port, default=8767)
    parser.add_argument("--open", dest="open_browser", action="store_true", help="open the local preview in the default browser")
    args = parser.parse_args()

    try:
        server = LocalPreviewServer(("127.0.0.1", args.port), PreviewHandler)
    except OSError as error:
        print(
            f"Cannot start preview at http://127.0.0.1:{args.port}/: {error}. "
            "The port may already be in use. No alternative port was selected.",
            file=sys.stderr,
            flush=True,
        )
        return 1

    with server:
        url = f"http://127.0.0.1:{args.port}/"
        print(f"Preview: {url}", flush=True)
        print("Only listed preview files are served. Press Ctrl-C to stop.", flush=True)
        browser_timer = None
        if args.open_browser:
            browser_timer = Timer(0.25, open_preview, args=(url,))
            browser_timer.daemon = True
            browser_timer.start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nPreview stopped.", flush=True)
        finally:
            if browser_timer is not None:
                browser_timer.cancel()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
