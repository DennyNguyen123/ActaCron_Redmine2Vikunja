# ActaCron: Redmine ➔ Vikunja Sync & AI Agent MCP Tools

Package tự động hóa trên nền tảng **ActaCron**, cung cấp luồng đồng bộ 1 chiều định kỳ từ **Redmine Query** sang **Vikunja**, kèm bộ công cụ **Dynamic MCP Tools** để AI Agent (Antigravity, Cursor, Claude Desktop...) có thể tra cứu và cập nhật ngược lại Redmine một cách an toàn và có kiểm soát.

---

## 🌟 Tính Năng Nổi Bật

1. **Đồng bộ 1 chiều định kỳ (Scheduled 1-Way Sync):**
   - Chạy nền tự động theo lịch Cron (`@cron 0/15 * * * *` - mỗi 15 phút).
   - Lọc và lấy danh sách issues từ Redmine theo `REDMINE_QUERY_ID`.
2. **Tham chiếu 1-1 toàn vẹn (Full 1-1 Reference):**
   - Tiêu đề task Vikunja mang định dạng chuẩn: `[#<id>] <subject>`.
   - Nội dung mô tả (description) đính kèm link gốc Redmine (`https://redmine.../issues/<id>`), metadata (Author, Assignee, Priority, Status, Done ratio).
   - **Tệp đính kèm (Attachments):** Không tải nhị phân nặng nề vào Vikunja; thay vào đó tự động format danh sách liên kết tải trực tiếp (`/attachments/download/<id>/<filename>`) kèm dung lượng file.
3. **Tự động đồng bộ Project (Auto Project Provisioning):**
   - Tự động nhận diện Project của Issue bên Redmine.
   - Nếu Project chưa có trên Vikunja, script sẽ tự động tạo Project mới trên Vikunja.
   - Sử dụng SQLite KV storage của ActaCron (`storage.get/set`) để cache ánh xạ `redmine_project_map`, tránh gọi API thừa.
4. **Tránh trùng lặp & Tối ưu hóa (Idempotent & State Tracking):**
   - Duy trì bảng trạng thái `redmine_issue_map` trên SQLite persistent storage.
   - So sánh mốc thời gian `updated_on`: Chỉ cập nhật những task thực sự có thay đổi từ Redmine, bỏ qua các task chưa đổi.
5. **AI Agent Dynamic MCP Tools (`redmine_mcp.js`):**
   - Đăng ký tự động qua Dual MCP Hub (StdIO & SSE) của ActaCron nhờ `@mcp true`.
   - `get_issue`: Cho phép AI đọc toàn bộ thông tin issue, ghi chú lịch sử (journals), files đính kèm.
   - `update_issue`: Cho phép AI ghi chú (notes), cập nhật trạng thái (`status_id`), và % tiến độ (`done_ratio`) có kiểm soát.
   - `sync_now`: Cho phép trigger đồng bộ tức thì (hỗ trợ cờ `dry_run` để xem trước kết quả).

---

## 📂 Cấu Trúc Mã Nguồn

```
ActaCron_Redmine2Vikunja/
├── modules/
│   ├── http.js               # HTTP client chuẩn hóa (GET, POST, PUT, DELETE)
│   ├── mapper.js             # Logic chuyển đổi Redmine Issue -> Vikunja Task
│   ├── redmine.js            # Redmine REST API client
│   ├── vikunja.js            # Vikunja REST API client & project provisioning
│   └── sync_engine.js        # Core pipeline điều phối đồng bộ & lưu cache
├── redmine_to_vikunja_sync.js# Script chạy ngầm định kỳ (@cron 0/15 * * * *)
├── redmine_mcp.js            # Dynamic MCP tool cho AI Agent (@mcp true)
├── tests/                    # Bộ unit test suite không phụ thuộc thư viện ngoài
│   ├── test_http.js
│   ├── test_mapper.js
│   ├── test_redmine.js
│   ├── test_vikunja.js
│   ├── test_sync_engine.js
│   └── test_mcp.js
├── workspace.json            # Cấu hình workspace timeout & metadata
├── .env.example              # Mẫu biến môi trường
└── package.json              # Khai báo test scripts & package info
```

---

## ⚙️ Cấu Hình Môi Trường (`.env`)

Sao chép file `.env.example` thành `.env` trong thư mục workspace hoặc cấu hình trực tiếp trên Web UI của ActaCron:

```env
# Redmine Configuration
REDMINE_URL=https://redmine.yourdomain.com
REDMINE_API_KEY=your_redmine_api_key
REDMINE_QUERY_ID=42

# Vikunja Configuration
VIKUNJA_URL=https://vikunja.yourdomain.com
VIKUNJA_API_TOKEN=your_vikunja_personal_access_token

# Optional Tuning
SYNC_LIMIT=50
LOG_LEVEL=info
```

> **Cách lấy API Tokens:**
> - **Redmine:** Vào *Tài khoản của tôi (My account)* -> Cột bên phải mục *Khóa truy cập API (API access key)* -> Bấm *Hiển thị*.
> - **Vikunja:** Vào *Settings* -> *API Tokens* -> Bấm *Create token* (Cấp quyền Read/Write cho Projects và Tasks).

---

## 🤖 Hướng Dẫn Sử Dụng MCP Tools Cho AI Agent

Khi ActaCron khởi chạy, script `redmine_mcp.js` được expose thành MCP tool mang tên `redmine_mcp`:

### 1. AI Đọc Thông Tin Issue (`get_issue`)
```json
{
  "action": "get_issue",
  "issue_id": 105
}
```

### 2. AI Cập Nhật Ghi Chú & Trạng Thái Issue (`update_issue`)
```json
{
  "action": "update_issue",
  "issue_id": 105,
  "notes": "Đã sửa xong lỗi căn chỉnh nút login trên giao diện mobile.",
  "status_id": 3,
  "done_ratio": 100
}
```

### 3. Trigger Đồng Bộ Ngay Lập Tức (`sync_now`)
```json
{
  "action": "sync_now",
  "dry_run": false
}
```

---

## 🧪 Kiểm Thử & Kiểm Tra Tính Tương Thích (Validation)

Chạy toàn bộ unit test suite và bộ kiểm tra cú pháp AST/JSDoc của ActaCron:

```bash
npm test
```

Hoặc chạy validator độc lập:

```bash
node scripts/validate.js
```
