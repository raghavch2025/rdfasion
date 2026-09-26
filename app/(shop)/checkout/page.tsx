import { CheckoutView } from "@/components/buyer/CheckoutView";
import { Header } from "@/components/buyer/Header";
import { getPublicSettings } from "@/lib/catalog";

export const metadata = { title: "Order bhejein · RD Fashion" };

export default async function CheckoutPage() {
  const settings = await getPublicSettings();
  return (
    <>
      <Header back="/cart" />
      <CheckoutView callNumber={settings.call_number} whatsappNumber={settings.whatsapp_number} />
    </>
  );
}
