import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Fixed sample values: they only demonstrate the next-intl formatters.
const SAMPLE_DATE = new Date(Date.UTC(2026, 9, 15, 12));
const SAMPLE_NUMBER = 1234.5;
const SAMPLE_PERCENT = 0.425;

export default function Home() {
  const t = useTranslations("home");
  const format = useFormatter();

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <h1>{t("title")}</h1>
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p>{t("body")}</p>
          <ul className="text-muted-foreground text-sm">
            <li>
              {t("formatting.date", {
                value: format.dateTime(SAMPLE_DATE, {
                  dateStyle: "long",
                  timeZone: "UTC",
                }),
              })}
            </li>
            <li>
              {t("formatting.number", {
                value: format.number(SAMPLE_NUMBER),
              })}
            </li>
            <li>
              {t("formatting.percent", {
                value: format.number(SAMPLE_PERCENT, {
                  style: "percent",
                  maximumFractionDigits: 1,
                }),
              })}
            </li>
          </ul>
        </CardContent>
        <CardFooter>
          <Button disabled>{t("cta")}</Button>
        </CardFooter>
      </Card>
    </main>
  );
}
