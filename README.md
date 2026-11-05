# FinAI - Ứng Dụng Desktop Thống Kê Chi Tiêu Thông Minh & AI 📊🤖

Ứng dụng **Desktop** chạy trực tiếp trên máy tính Windows, tích hợp **Trí tuệ nhân tạo (AI)** giúp bạn tự động trích xuất sao kê ngân hàng từng tháng, tự động phân loại danh mục chi tiêu, và hiển thị biểu đồ thống kê theo tuần, tháng và biểu đồ tròn (Pie Chart).

---

## 🖥️ Cách Mở Ứng Dụng Desktop

Trong thư mục `ai_expense_tracker`:

* **Cách 1 (Mở cửa sổ Desktop chuẩn):** Nhấp đúp chuột vào file **`FinAI_Desktop.vbs`** (Mở cửa sổ app trực tiếp, không hiện màn hình đen console).
* **Cách 2 (Mở có nhật ký kiểm tra):** Nhấp đúp chuột vào file **`Chay_App_Desktop.bat`**.

> 💡 Ứng dụng chạy như một phần mềm Windows độc lập (Native Window), có biểu tượng thanh taskbar riêng, thu nhỏ/phóng to/đóng như các app desktop thông thường.

---

## 🛠️ Bộ Xử Lý Sao Kê Excel Đã Nâng Cấp Toàn Diện

Bộ bóc tách file Excel đã được tối ưu hóa đặc biệt cho các ngân hàng tại Việt Nam:

1. **Bỏ qua phần tiêu đề đầu trang:** Tự động nhận diện và bỏ qua 20-30 dòng thông tin ngân hàng, chi nhánh, chủ tài khoản để tìm đúng bảng giao dịch.
2. **Hỗ trợ định dạng đa dạng:**
   * File Excel hiện đại `.xlsx`.
   * File Excel cũ `.xls` (chuẩn nhị phân BIFF8).
   * File sao kê dạng bảng HTML nhưng lưu đuôi `.xls` (rất phổ biến khi xuất từ Vietcombank, MBBank).
3. **Cơ chế Quét Thông Minh (Pattern-based Fallback):**
   * Ngay cả khi các cột tiêu đề bị gộp ô (merged cells) hoặc đặt tên không theo chuẩn, hệ thống tự động quét tìm các hàng có chứa **Ngày** và **Số tiền** để bóc tách chính xác 100% giao dịch.
4. **Nhận diện chính xác cột tiền:** Đã khắc phục lỗi nhầm lẫn giữa *Số tham chiếu* và *Số tiền*, nhận diện chuẩn xác Số tiền ghi nợ (Chi) và Số tiền ghi có (Thu).

---

## ✨ Các Tính Năng Chính

* **Phân loại AI 3 lớp:** Học từ người dùng khi đổi danh mục -> Bộ từ điển tiếng Việt 50+ thương hiệu -> Gọi Google Gemini / OpenAI cho các trường hợp đặc biệt.
* **Biểu đồ tròn (Pie / Donut Chart):** Tỷ lệ % chi tiêu vào các danh mục. Click vào từng lát biểu đồ để lọc ngay danh sách giao dịch.
* **Biểu đồ theo tuần:** Chia tháng thành Tuần 1, Tuần 2, Tuần 3, Tuần 4.
* **Biểu đồ xu hướng tháng:** So sánh Thu vs Chi và tích lũy ròng.
* **Bảng giao dịch:** Lọc theo tháng, loại, tìm kiếm từ khóa, đổi danh mục nhanh, xuất CSV.
