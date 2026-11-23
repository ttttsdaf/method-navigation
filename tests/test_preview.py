# SPDX-License-Identifier: AGPL-3.0-only
from http.client import HTTPConnection
from io import BytesIO
from threading import Thread
import unittest
from zipfile import ZipFile

import serve


class PreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = serve.LocalPreviewServer(("127.0.0.1", 0), serve.PreviewHandler)
        cls.port = cls.server.server_port
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(3)

    def request(self, method, path):
        connection = HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            connection.request(method, path)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_preview_resources_are_readable(self):
        for path in ("/", "/app.js", "/style.css", "/data/methods.json", "/data/scenarios.json"):
            with self.subTest(path=path):
                status, _, body = self.request("GET", path)
                self.assertEqual(status, 200)
                self.assertTrue(body)

    def test_head_has_no_body_and_writes_are_rejected(self):
        status, headers, body = self.request("HEAD", "/")
        self.assertEqual(status, 200)
        self.assertGreater(int(headers["Content-Length"]), 0)
        self.assertEqual(body, b"")
        status, headers, _ = self.request("POST", "/")
        self.assertEqual(status, 405)
        self.assertEqual(headers["Allow"], "GET, HEAD")

    def test_nonpublic_paths_are_unavailable(self):
        for path in ("/.git/config", "/.env", "/tests/test_preview.py"):
            with self.subTest(path=path):
                status, _, _ = self.request("GET", path)
                self.assertEqual(status, 404)

    def test_source_archive_contains_the_published_runtime_sources(self):
        status, _, body = self.request("GET", "/source.zip")
        self.assertEqual(status, 200)
        with ZipFile(BytesIO(body)) as archive:
            self.assertCountEqual(
                archive.namelist(),
                (
                    "app/index.html", "app/style.css", "app/app.js", "app/scenarios.json",
                    "content/methods.json", "content/example-record.json", "serve.py",
                    "start-preview.cmd", "LICENSE", "LICENSES/CC-BY-SA-4.0.txt", "NOTICE.md",
                ),
            )
            self.assertIsNone(archive.testzip())
