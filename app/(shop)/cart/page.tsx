import { CartView } from "@/components/buyer/CartView";
import { Header } from "@/components/buyer/Header";
import { getPublicSettings } from "@/lib/catalog";

export const metadata = { title: "Cart · RD Fashion" };

export default async function CartPage() {
  const settings = await getPublicSettings();
  return (
    <>
      <Header back="/" />
      <CartView callNumber={settings.call_number} />
    </>
  );
}
