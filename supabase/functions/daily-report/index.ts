// supabase/functions/daily-report/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const FROM_EMAIL =
  Deno.env.get("FROM_EMAIL") ??
  "onboarding@resend.dev";

const supabase = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function jsonResponse(
  body: unknown,
  status = 200
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function formatCurrency(amount: number) {
  return `Rs. ${Math.round(amount).toLocaleString("en-IN")}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getISTDateTime() {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
    })
  );
}

function getISTDateString() {
  return getISTDateTime()
    .toISOString()
    .slice(0, 10);
}

function getISTTimeString() {
  return getISTDateTime()
    .toTimeString()
    .slice(0, 5);
}

async function sendEmail({
  settings,
  recipients,
  subject,
  html,
}: {
  settings: any;
  recipients: string[];
  subject: string;
  html: string;
}) {
  const smtpConfigured =
    Boolean(settings.smtp_host) &&
    Boolean(settings.smtp_port) &&
    Boolean(settings.smtp_user) &&
    Boolean(settings.smtp_password);

  console.log("=================================");
  console.log("EMAIL CONFIGURATION");
  console.log("SMTP Configured:", smtpConfigured);
  console.log("Has Resend Key:", !!RESEND_API_KEY);
  console.log("From Email:", FROM_EMAIL);
  console.log("Recipients:", recipients);
  console.log("=================================");

  // SMTP
  if (smtpConfigured) {
    console.log("Using SMTP...");

    const { SMTPClient } = await import(
      "https://esm.sh/denomailer@1.6.0"
    );

    const port = Number(settings.smtp_port);

    const client = new SMTPClient({
      connection: {
        hostname: settings.smtp_host,
        port,
        tls: port === 465,
        auth: {
          username: settings.smtp_user,
          password: settings.smtp_password,
        },
      },
    });

    try {
      await client.send({
        from: settings.smtp_user,
        to: recipients,
        subject,
        content: "HTML Email",
        html,
      });

      console.log("SMTP Email Sent Successfully");

      return {
        method: "smtp",
        host: settings.smtp_host,
      };
    } finally {
      await client.close();
    }
  }

  // RESEND
  console.log("Using Resend...");

  if (!RESEND_API_KEY) {
    throw new Error(
      "RESEND_API_KEY is missing. Add it in Supabase Edge Function Secrets."
    );
  }

  const response = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Toys Corner <${FROM_EMAIL}>`,
        to: recipients,
        subject,
        html,
      }),
    }
  );

  const responseBody = await response.text();

  if (!response.ok) {
    console.error("Resend Error:");
    console.error(responseBody);

    throw new Error(
      `Resend Error (${response.status}): ${responseBody}`
    );
  }

  console.log("Resend Success:");
  console.log(responseBody);

  return {
    method: "resend",
  };
}

Deno.serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response(
      "ok",
      {
        headers: corsHeaders,
      }
    );
  }

  if (
    req.method !== "GET" &&
    req.method !== "POST"
  ) {
    return jsonResponse(
      {
        error:
          "Method not allowed",
      },
      405
    );
  }

  try {

    const {
      data: settings,
      error: settingsError,
    } =
      await supabase
        .from("settings")
        .select("*")
        .eq("id", 1)
        .single();

    if (settingsError) {
      throw settingsError;
    }

    if (!settings?.notification_email) {
      return jsonResponse({
        skipped: true,
        reason:
          "notification_email missing",
      });
    }

    let bodyDate;
    let force = false;

    try {
      const body =
        await req.json();

      bodyDate =
        body?.date;

      force =
        Boolean(body?.force);

    } catch {
      // cron request without body
    }

    const today =
      bodyDate ??
      getISTDateString();

    // ================================
    // DYNAMIC TIME CHECK FROM DATABASE
    // ================================
    if (!force) {
      if (!settings.daily_report_enabled) {
        return jsonResponse({
          skipped: true,
          reason: "Daily report disabled in settings",
        });
      }

      // Get current time and database time
      const currentTime = getISTTimeString();  // "21:30"
      const reportTime = settings.daily_report_time?.slice(0, 5);  // "21:00"

      console.log("=================================");
      console.log("TIMING CHECK");
      console.log("Current IST Time:", currentTime);
      console.log("Report Time (from DB):", reportTime);
      console.log("Today's Date:", today);
      console.log("Last Report Date:", settings.last_report_date);
      console.log("=================================");

      // Check if current time matches report time
      if (currentTime !== reportTime) {
        return jsonResponse({
          skipped: true,
          reason: `Waiting for ${reportTime}`,
          currentTime,
        });
      }

      // Check if already sent today
      if (settings.last_report_date === today) {
        return jsonResponse({
          skipped: true,
          reason: "Report already sent today",
        });
      }
    }

    const recipients =
      settings.notification_email
        .split(",")
        .map((x: string) => x.trim())
        .filter(Boolean);

    if (!recipients.length) {
      return jsonResponse({
        skipped: true,
        reason:
          "no recipients",
      });
    }

    // ================================
    // SALES + EXPENSES
    // ================================
    const [
      salesResult,
      expensesResult,
    ] = await Promise.all([

      supabase
        .from("sales")
        .select(
          "id, grand_total, customer_id, payment_method"
        )
        .eq("date", today),

      supabase
        .from("expenses")
        .select("amount")
        .eq("date", today),

    ]);

    if (salesResult.error) {
      throw salesResult.error;
    }

    if (expensesResult.error) {
      throw expensesResult.error;
    }

    const sales =
      salesResult.data ?? [];

    const expenses =
      expensesResult.data ?? [];

    const totalSales =
      sales.reduce(
        (sum, row) =>
          sum + Number(row.grand_total || 0),
        0
      );

    const totalExpenses =
      expenses.reduce(
        (sum, row) =>
          sum + Number(row.amount || 0),
        0
      );

    const profit =
      totalSales - totalExpenses;

    const uniqueCustomers =
      new Set(
        sales
          .filter(
            (s: any) => s.customer_id
          )
          .map(
            (s: any) => s.customer_id
          )
      ).size;

    // ================================
    // PAYMENT BREAKDOWN
    // ================================
    const paymentBreakdown: any = {

      Cash: {
        count: 0,
        total: 0,
      },

      UPI: {
        count: 0,
        total: 0,
      },

      Card: {
        count: 0,
        total: 0,
      },

    };

    for (const sale of sales) {

      const method =
        sale.payment_method;

      if (
        paymentBreakdown[method]
      ) {

        paymentBreakdown[method].count++;

        paymentBreakdown[method].total +=
          Number(
            sale.grand_total || 0
          );

      }

    }

    // ================================
    // TOP PRODUCT
    // ================================
    let topProduct =
      "No sales today";

    let soldQty = 0;

    const saleIds =
      sales.map(
        (s: any) => s.id
      );

    if (saleIds.length) {

      const {
        data: items,
        error: itemError,

      } =
        await supabase
          .from("sale_items")
          .select(
            `
            qty,
            products(product_name)
            `
          )
          .in(
            "sale_id",
            saleIds
          );

      if (itemError) {
        throw itemError;
      }

      const productTotals: any = {};

      for (
        const item of items ?? []
      ) {

        soldQty +=
          Number(item.qty || 0);

        const name =
          item.products?.product_name ??
          "Unknown";

        productTotals[name] =
          (
            productTotals[name] ?? 0
          ) +
          Number(item.qty || 0);

      }

      const sorted =
        Object.entries(productTotals)
          .sort(
            (a: any, b: any) =>
              b[1] - a[1]
          );

      if (sorted.length) {

        topProduct =
          `${sorted[0][0]} (${sorted[0][1]} sold)`;

      }

    }

    // ================================
    // STOCK ALERTS
    // ================================
    const {
      data: products,
      error: productError,

    } =
      await supabase
        .from("products")
        .select(
          `
          product_name,
          current_stock,
          minimum_stock
          `
        )
        .eq(
          "status",
          "active"
        );

    if (productError) {
      throw productError;
    }

    const lowStock =
      (products ?? [])
        .filter(
          (p: any) =>
            Number(p.minimum_stock) > 0 &&
            Number(p.current_stock) >= 0 &&
            Number(p.current_stock)
              <= Number(p.minimum_stock)
        );

    const negativeStock =
      (products ?? [])
        .filter(
          (p: any) =>
            Number(p.current_stock) < 0
        );

    function suggestedPurchase(
      current: number,
      minimum: number
    ) {
      return Math.max(
        (minimum * 2) - current,
        0
      );
    }

    const lowStockRows =
      lowStock
        .map(
          (p: any) =>

          `
        <tr style="border-bottom:1px solid #FEF3C7; background:#FFFBEB;">
          <td style="text-align:left; padding:10px; border-right:1px solid #FCD34D;">${escapeHtml(p.product_name)}</td>
          <td style="text-align:center; padding:10px; border-right:1px solid #FCD34D; font-weight:bold; color:#DC2626;">${p.current_stock}</td>
          <td style="text-align:center; padding:10px; border-right:1px solid #FCD34D;">${p.minimum_stock}</td>
          <td style="text-align:center; padding:10px; font-weight:bold; color:#F59E0B;">
            ${suggestedPurchase(
            Number(p.current_stock),
            Number(p.minimum_stock)
          )}
          </td>
        </tr>
        `
        )
        .join("");

    const negativeStockRows =
      negativeStock
        .map(
          (p: any) =>
          `
        <li>
          ${escapeHtml(p.product_name)}
          :
          <strong style="color:red">
            ${p.current_stock}
          </strong>
        </li>
        `
        )
        .join("");

    const paymentRows =
      Object.entries(paymentBreakdown)
        .map(
          ([method, data]: any) =>

          `
        <tr>
          <td>${method}</td>
          <td>${data.count}</td>
          <td>${formatCurrency(data.total)}</td>
        </tr>
        `
        )
        .join("");

    // ================================
    // PENDING INQUIRIES
    // ================================
    const {
      count: pendingInquiries,
      error: inqError,

    } =
      await supabase
        .from("inquiries")
        .select(
          "id",
          {
            count: "exact",
            head: true,
          }
        )
        .eq(
          "status",
          "Pending"
        );

    if (inqError) {
      throw inqError;
    }

    // ================================
    // EMAIL HTML
    // ================================
    const html = `
    <div style="
      font-family:Arial,sans-serif;
      max-width:650px;
      margin:auto;
      color:#334155;
    ">

      <h2 style="color:#4F46E5;">
        🧸 Toys Corner — Daily Report
      </h2>

      <p>
        Report Date:
        <strong>${today}</strong>
      </p>

      <table
        style="
        width:100%;
        border-collapse:collapse;
        margin:20px 0;
        "
      >

        <tr style="background:#F8FAFC">
          <td><b>Today's Sales</b></td>
          <td>${formatCurrency(totalSales)}</td>
        </tr>

        <tr>
          <td><b>Today's Expenses</b></td>
          <td>${formatCurrency(totalExpenses)}</td>
        </tr>

        <tr style="background:#F8FAFC">
          <td><b>Today's Profit</b></td>
          <td>${formatCurrency(profit)}</td>
        </tr>

        <tr>
          <td><b>Orders</b></td>
          <td>${sales.length}</td>
        </tr>

        <tr style="background:#F8FAFC">
          <td><b>Customers</b></td>
          <td>${uniqueCustomers}</td>
        </tr>

        <tr>
          <td><b>Items Sold</b></td>
          <td>${soldQty}</td>
        </tr>

        <tr style="background:#F8FAFC">
          <td><b>Top Product</b></td>
          <td>${escapeHtml(topProduct)}</td>
        </tr>

        <tr>
          <td><b>Pending Inquiries</b></td>
          <td>${pendingInquiries ?? 0}</td>
        </tr>

      </table>

      <h3 style="color:#4F46E5">
        Payment Breakdown
      </h3>

      <table
        style="
        width:100%;
        border-collapse:collapse;
        "
      >

        <tr style="background:#EEF2FF">
          <th align="left">Method</th>
          <th align="left">Orders</th>
          <th align="left">Amount</th>
        </tr>

        ${paymentRows}

      </table>

      ${
      lowStock.length > 0
        ?

        `
        <h3 style="color:#F59E0B">
          ⚠️ Low Stock Alert
        </h3>

        <table
          style="
          width:100%;
          border-collapse:collapse;
          border:1px solid #FCD34D;
          margin:15px 0;
          "
        >

          <tr style="background:#FEF3C7; border-bottom:2px solid #FCD34D;">

            <th style="text-align:left; padding:12px; border-right:1px solid #FCD34D; font-weight:bold;">
              Product
            </th>

            <th style="text-align:center; padding:12px; border-right:1px solid #FCD34D; font-weight:bold;">
              Current
            </th>

            <th style="text-align:center; padding:12px; border-right:1px solid #FCD34D; font-weight:bold;">
              Minimum
            </th>

            <th style="text-align:center; padding:12px; font-weight:bold;">
              Purchase
            </th>

          </tr>

          ${lowStockRows}

        </table>
        `

        :

        `
        <p style="color:#16A34A">
          ✓ No low stock items.
        </p>
        `
    }

      ${
      negativeStock.length > 0

        ?

        `
        <h3 style="color:#DC2626">
          🔴 Negative Stock
        </h3>

        <ul>
          ${negativeStockRows}
        </ul>
        `

        :

        ""
    }

      <hr/>

      <p
        style="
        color:#94A3B8;
        font-size:12px;
        "
      >

        Automated report from Toys Corner system.
        <br/>

        Powered by Abronix Technologies

      </p>

    </div>
    `;

    // ================================
    // SEND EMAIL
    // ================================
    const result =
      await sendEmail({
        settings,
        recipients,
        subject:
          `Toys Corner Daily Report — ${today}`,
        html,
      });

    // Save today's send status
    await supabase
      .from("settings")
      .update({
        last_report_date:
          today,
      })
      .eq(
        "id",
        1
      );

    console.log("=================================");
    console.log("EMAIL SENT SUCCESSFULLY");
    console.log(result);
    console.log("=================================");

    return jsonResponse({

      sent: true,

      via:
        result.method,

      recipients,

      date:
        today,

      totalSales,

      totalExpenses,

      profit,

      paymentBreakdown,

      lowStockCount:
        lowStock.length,

      negativeStockCount:
        negativeStock.length,

    });

  }

  catch (error) {

    console.error("=================================");
    console.error("DAILY REPORT ERROR");
    console.error(error);
    console.error("=================================");

    return jsonResponse(

      {
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },

      500

    );

  }

});