# QUY TẮC BẮT BUỘC DỰ ÁN LIFE HUB OS (FINANCE & LIFE SYSTEM)

## 📌 QUY TẮC TỰ ĐỘNG CẬP NHẬT PHIÊN BẢN (AUTO-VERSIONING PROTOCOL)
Mỗi khi người dùng đưa ra yêu cầu thay đổi, sửa lỗi, cập nhật tính năng hay đại tu giao diện:
Ngay sau khi hoàn thành công việc, **BẮT BUỘC** phải tự động tạo một file ZIP phiên bản mới vào thư mục `D:\Finance\versions\` tương ứng với mức độ thay đổi theo chuẩn **Semantic Versioning (`MAJOR.MINOR.PATCH`)**:

1. **Thay đổi nhỏ (`PATCH` - tăng số thứ 3, ví dụ `2.0.0` -> `2.0.1`):**
   - Sửa lỗi nhỏ (bug fixes), tinh chỉnh lề viền (padding/margin), sửa font chữ, câu từ hiển thị, cập nhật nhãn nút bấm.
2. **Thay đổi vừa (`MINOR` - tăng số thứ 2 và reset số thứ 3 về 0, ví dụ `2.0.1` -> `2.1.0`):**
   - Thêm tính năng mới, tạo biểu đồ mới, thêm màn hình/module mới, tối ưu giao diện lớn, cơ chế đồng bộ hoặc kết nối mới.
3. **Thay đổi lớn (`MAJOR` - tăng số đầu tiên và reset các số sau về 0, ví dụ `2.X.X` -> `3.0.0`):**
   - Đại tu kiến trúc ứng dụng, chuyển đổi toàn diện mô hình hệ thống, tái thiết kế thương hiệu cốt lõi.

### 🛠️ LỆNH THỰC THI TỰ ĐỘNG:
Sau mỗi lượt sửa đổi mã nguồn xong, chỉ cần chạy script tự động:
```powershell
& "C:\Users\Admin\AppData\Local\Python\pythoncore-3.14-64\python.exe" "D:\Finance\versions\auto_version.py" --type patch|minor|major --title "Mô tả thay đổi" --request "Yêu cầu của người dùng"
```
Script sẽ tự động:
- Đóng gói toàn bộ code và tài nguyên hiện tại thành `vX.Y.Z (Mô tả sửa đổi).zip` (có phần mở ngoặc mô tả nội dung sửa đổi bên cạnh tên phiên bản)
- Tạo file `VERSION_INFO.md` bên trong gói zip
- Cập nhật dòng mới vào bảng `VERSIONS_INDEX.md` và `README.md`
- Báo cáo mã phiên bản mới cho người dùng.

## 📌 QUY TẮC ĐỒNG BỘ CLOUD MIRROR
Mọi thay đổi code trong `D:\Finance` phải được sao chép sang `D:\Finance\update` để phục vụ đồng bộ Render Cloud và GitHub.
