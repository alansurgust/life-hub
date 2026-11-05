using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace LifeHub
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            // Dynamically locate the app directory
            string appDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
            if (!File.Exists(Path.Combine(appDir, "desktop_app.py")))
            {
                if (Directory.Exists(@"D:\app\finance") && File.Exists(@"D:\app\finance\desktop_app.py"))
                {
                    appDir = @"D:\app\finance";
                }
                else if (Directory.Exists(@"D:\Finance") && File.Exists(@"D:\Finance\desktop_app.py"))
                {
                    appDir = @"D:\Finance";
                }
            }

            string pythonw = @"C:\Users\Admin\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe";
            if (!File.Exists(pythonw))
            {
                pythonw = @"C:\Users\Admin\AppData\Local\Python\bin\pythonw.exe";
                if (!File.Exists(pythonw))
                {
                    pythonw = "pythonw.exe";
                }
            }

            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = pythonw;
            psi.Arguments = "desktop_app.py";
            psi.WorkingDirectory = appDir;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            psi.CreateNoWindow = true;
            psi.UseShellExecute = false;

            try
            {
                Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Không thể khởi động Life Hub: " + ex.Message, "Life Hub Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
