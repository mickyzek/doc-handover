# doc-handover

## Preview UI (local)

ถ้าต้องการเปิดไฟล์ `preview.html` ให้ทำตามนี้:

```bash
cd /workspace/doc-handover
bash run-preview.sh
```

จากนั้นเปิดเบราว์เซอร์ที่:

```text
http://localhost:4173/preview.html
```

> ถ้าเห็น `ERR_CONNECTION_REFUSED` แปลว่ายังไม่ได้สตาร์ท local server (หรือปิดไปแล้ว)

### ทางเลือก (ไม่ต้องเปิด server)

สามารถเปิดไฟล์ตรงได้ด้วย `file://`:

```text
file:///workspace/doc-handover/preview.html
```
