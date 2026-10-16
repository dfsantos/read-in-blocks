import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// TODO(US-002): replace the literals below with next-intl messages (pt-BR).
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <h1>Read in Blocks</h1>
          </CardTitle>
          <CardDescription>
            Acompanhe sua leitura por partes, capítulos e tópicos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            O projeto base está pronto. As funcionalidades chegam por história.
          </p>
        </CardContent>
        <CardFooter>
          <Button disabled>Em breve</Button>
        </CardFooter>
      </Card>
    </main>
  );
}
