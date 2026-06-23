# QA-Pariksha

✅ RTM extraction complete: 72 requirements found
INFO:     127.0.0.1:50296 - "POST /api/v1/testcase-generation/extract-requirements HTTP/1.1" 200 OK
INFO:     127.0.0.1:62371 - "OPTIONS /api/v1/testcase-generation/generate-testcases HTTP/1.1" 200 OK

============================================================
Generate request for UUID : 64b4d6b1-9fa8-4bad-ac5b-50bca46b2ce2
Requested by              : cbsuser@sbi.co.in  role=user
Testcase client           : UAT
RAG doc_ids               : None
============================================================

selected_dept_desc...................... None
Found record for UUID: 64b4d6b1-9fa8-4bad-ac5b-50bca46b2ce2  total_pages=24
📁 Moved file: C:\qapariksha_uploads\uploaded\sdfvb_wrgv_20260623_124452.pdf → C:\qapariksha_uploads\in_progress\sdfvb_wrgv_20260623_124452.pdf
File in progress: C:\qapariksha_uploads\in_progress\sdfvb_wrgv_20260623_124452.pdf
Activity record created for: cbsuser

🔍 Extracting pages with image support…

📄 Pass 1: identifying repeated images across 24 pages…
  → 2 repeated xrefs identified (likely logos/headers).
📄 Pass 2: extracting text and collecting images…
    📐 Learned margins: header=95px  footer=735px  (page_h=792px)
  ✓ Page 1, Image 1: queued
  ✓ Page 1, Image 2: queued
  ✓ Page 9, Image 3: queued
    🔍 Noise fingerprint: 0 repeated lines found (threshold: 8/24 pages)
  → 3 images queued for Azure vision.
📄 Pass 3: Azure vision (3 threads)…
  🖼  Page 1, Image 1: Azure vision…
  🖼  Page 1, Image 2: Azure vision…
  🖼  Page 9, Image 3: Azure vision…
2026-06-23 12:47:50,540 [INFO] httpx: HTTP Request: POST https://sbi-qualitia-ai-services.openai.azure.com/openai/deployments/gpt-4.1-mini/chat/completions?api-version=2024-12-01-preview "HTTP/1.1 200 OK"
  🔍 Page 1, Image 2: logo detected → discarded
2026-06-23 12:47:51,060 [INFO] httpx: HTTP Request: POST https://sbi-qualitia-ai-services.openai.azure.com/openai/deployments/gpt-4.1-mini/chat/completions?api-version=2024-12-01-preview "HTTP/1.1 200 OK"
  ✓ Page 1, Image 1: OCR=52c Desc=131c
2026-06-23 12:47:54,326 [INFO] httpx: HTTP Request: POST https://sbi-qualitia-ai-services.openai.azure.com/openai/deployments/gpt-4.1-mini/chat/completions?api-version=2024-12-01-preview "HTTP/1.1 200 OK"
  ✓ Page 9, Image 3: OCR=418c Desc=666c
📄 Pass 4: assembling page content…
  ✓ Page 1: 639 chars
  ✓ Page 2: 756 chars
  ✓ Page 3: 695 chars
  ✓ Page 4: 382 chars
  ✓ Page 5: 2693 chars
  ✓ Page 6: 32 chars
  ✓ Page 7: 1085 chars
  ✓ Page 8: 2187 chars
  ✓ Page 9: 3113 chars
  ✓ Page 10: 2905 chars
  ✓ Page 11: 2623 chars
  ✓ Page 12: 2813 chars
  ✓ Page 13: 2211 chars
  ✓ Page 14: 329 chars
  ✓ Page 15: 5 chars
  ✓ Page 16: 2 chars
  ✓ Page 17: 2 chars
  ✓ Page 18: 651 chars
  ✓ Page 19: 359 chars
  ✓ Page 20: 2 chars
  ✓ Page 21: 2 chars
  ✓ Page 22: 2 chars
  ✓ Page 23: 538 chars
  ✓ Page 24: 183 chars
✅ Extraction complete. 24 pages ready.

Unexpected error: 'TestCaseRequest' object has no attribute 'rtm_mode'
Traceback (most recent call last):
  File "D:\QA_Pariksha_RAG\backend\api\endpoints\v1\generate_tests_api.py", line 465, in generate_testcases
    if request.rtm_mode and request.selected_requirements:
       ^^^^^^^^^^^^^^^^
  File "D:\QA_Pariksha_RAG\venv\Lib\site-packages\pydantic\main.py", line 1042, in __getattr__
    raise AttributeError(f'{type(self).__name__!r} object has no attribute {item!r}')
AttributeError: 'TestCaseRequest' object has no attribute 'rtm_mode'

📁 Moved file: C:\qapariksha_uploads\in_progress\sdfvb_wrgv_20260623_124452.pdf → C:\qapariksha_uploads\failed\sdfvb_wrgv_20260623_124452.pdf
INFO:     127.0.0.1:50296 - "POST /api/v1/testcase-generation/generate-testcases HTTP/1.1" 500 Internal Server Error
