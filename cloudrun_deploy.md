# Hướng Dẫn Triển Khai Life Hub Lên Google Cloud Run (24/7 Miễn Phí)

Tài liệu này hướng dẫn bạn đưa ứng dụng **Life Hub** lên **Google Cloud Run** bằng chính tài khoản Google của bạn, hoàn toàn miễn phí (gói Always Free 2 triệu lượt truy cập/tháng).

---

## CÁCH 1: Triển khai nhanh qua Google Cloud Shell (Chỉ 1 dòng lệnh - Khuyên dùng)

Google Cloud Shell là máy ảo miễn phí chạy ngay trên trình duyệt web của bạn, đã có sẵn mọi công cụ của Google.

### Bước 1: Mở Google Cloud Shell
1. Mở trình duyệt web và truy cập: **https://shell.cloud.google.com**
2. Đăng nhập bằng tài khoản Google cá nhân của bạn.

### Bước 2: Tải thư mục mã nguồn lên Cloud Shell
1. Trên giao diện Cloud Shell, bấm vào biểu tượng dấu ba chấm **`⋮`** (hoặc nút **Upload file**) ở góc trên bên phải.
2. Chọn file nén `.zip` của thư mục `D:\app\finance` (hoặc kéo thả cả thư mục lên).
3. Nếu tải file `.zip`, giải nén bằng lệnh:
   ```bash
   unzip Finance.zip -d life-hub && cd life-hub
   ```

### Bước 3: Chạy lệnh triển khai Cloud Run
Chạy đúng một dòng lệnh sau:
```bash
gcloud run deploy life-hub \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi
```
* **Khi được hỏi xác nhận**: Gõ `y` rồi nhấn **Enter**.
* Sau khoảng **1 - 2 phút**, màn hình sẽ hiển thị đường link truy cập công khai của bạn, ví dụ:
  ```text
  Service URL: https://life-hub-xxxxxx-as.a.run.app
  ```

---

## CÁCH 2: Triển khai qua GitHub & Google Cloud Console (Giao diện trực quan)

Nếu bạn có tài khoản GitHub:
1. Đẩy mã nguồn từ `D:\app\finance` lên một kho lưu trữ riêng tư (**Private repository**) trên GitHub.
2. Truy cập: **https://console.cloud.google.com/run**
3. Bấm **"Create Service" (Tạo dịch vụ)**.
4. Chọn **"Continuously deploy from a repository"** -> Kết nối với GitHub và chọn repo của bạn.
5. Cấu hình dịch vụ:
   * **Service name**: `life-hub`
   * **Region**: `asia-southeast1 (Singapore)` (tốc độ nhanh nhất cho Việt Nam)
   * **Authentication**: Chọn **"Allow unauthenticated invocations"** (để bạn có thể mở trên điện thoại mà không cần đăng nhập tài khoản IAM phức tạp)
6. Bấm **Create**. Google Cloud Build sẽ tự động build Docker image và khởi chạy Cloud Run cho bạn!

---

## KẾT NỐI VÀ SỬ DỤNG TRÊN IPHONE / IPAD & LAPTOP

### 1. Trên iPhone / iPad (Dùng 24/7 mọi lúc mọi nơi):
1. Mở **Safari** và gõ đường link Cloud Run vừa nhận được (ví dụ `https://life-hub-xxxx.a.run.app`).
2. Bấm nút **Chia sẻ (Share)** ở thanh dưới cùng Safari -> Chọn **"Thêm vào Màn hình chính" (Add to Home Screen)**.
3. Khi ra ngoài, bạn chỉ cần mở icon Life Hub lên để:
   * Ghi nhanh chi tiêu khi mua sắm, ăn uống.
   * Tick thói quen hàng ngày.
   * Xem và check to-do.

### 2. Trên Laptop (Đồng bộ 2 chiều về Desktop App):
1. Mở ứng dụng Desktop trên laptop như bình thường.
2. Bấm vào nút **Cài đặt** (hoặc nút **`📱 Link Điện Thoại`**).
3. Dán đường link Cloud Run vào ô: **Đồng Bộ Google Cloud Run**.
4. Bấm **"Đồng bộ ngay"**:
   * Mọi giao dịch bạn nhập trên iPhone khi ra ngoài sẽ **tự động được kéo về lưu vĩnh viễn vào ổ `D:\app\finance\expense_data.db`**.
   * Đồng thời, các giao dịch và dữ liệu mới bạn thêm trên laptop cũng được tải lên Cloud Run để iPhone luôn cập nhật mới nhất!
