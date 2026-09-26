import { loadDesk } from "@/lib/upload-view";
import { UploadDesk } from "@/components/upload/UploadDesk";

export const maxDuration = 60;

// Same screen as Papa's upload link, for signed-in admins.
export default async function AdminUploadPage() {
  const data = await loadDesk();
  return <UploadDesk token={null} data={data} />;
}
