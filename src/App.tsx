import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { Zap, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { format } from "date-fns"

import { api } from "./lib/api"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

// --- TYPES ---
interface Reading {
  month: string
  previous_meter: number
  current_meter: number
  units_used: number
  cost: number
  capacity: number
}

interface ForecastResponse {
  history: number[]
  forecast: {
    sma_3_month: number
    wma_3_month: number
    trend_forecast: number
  }
  trend_direction: string
}

export default function App() {
  const [readings, setReadings] = useState<Reading[]>([])
  const [forecast, setForecast] = useState<ForecastResponse | null>(null)
  const [lastReading, setLastReading] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(true)

  // Dynamic Validation Schema based on the last reading
  const formSchema = z.object({
    month: z.string().min(1, { message: "Month is required" }),
    current_value: z.coerce.number().min(lastReading, {
      message: `Reading must be at least ${lastReading} (last recorded)`,
    }),
    amps: z.coerce.number().min(5).max(60),
  })

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      month: format(new Date(), "yyyy-MM-dd"),
      current_value: 0,
      amps: 5, // Default to 5A
    },
  })

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [readingsRes, forecastRes] = await Promise.all([
        api.get<Reading[]>("/readings"),
        api.get<ForecastResponse>("/forecast"),
      ])

      setReadings(readingsRes.data)
      setForecast(forecastRes.data)

      if (readingsRes.data && readingsRes.data.length > 0) {
        // Readings are sorted DESC from the Go backend, so index 0 is the latest
        setLastReading(readingsRes.data[0].current_meter)
        form.setValue("current_value", readingsRes.data[0].current_meter)
        form.setValue("amps", readingsRes.data[0].capacity) // Carry over previous amp capacity
      }
    } catch (error) {
      console.error("Failed to fetch data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      await api.post("/readings", values)
      fetchData() // Refresh data after successful submission
      form.reset()
    } catch (error) {
      console.error("Failed to submit reading:", error)
    }
  }

  // Prepare data for Recharts
  const prepareChartData = () => {
    if (!readings || readings.length === 0) return []

    // Reverse to chronological order (ASC) for the chart
    const chartData: any[] = [...readings].reverse().map((r) => ({
      name: format(new Date(r.month), "MMM yyyy"),
      Actual: r.units_used,
    }))

    // Append the linear regression forecast as the next future data point
    if (forecast) {
      const nextMonth = new Date(readings[0].month)
      nextMonth.setMonth(nextMonth.getMonth() + 1)

      // Connect the lines by carrying over the last actual reading
      chartData[chartData.length - 1].Predicted =
        chartData[chartData.length - 1].Actual

      chartData.push({
        name: format(nextMonth, "MMM yyyy") + " (Est)",
        Predicted: forecast.forecast.trend_forecast,
      })
    }

    return chartData
  }

  const getTrendIcon = (direction: string) => {
    if (direction.includes("UP"))
      return <TrendingUp className="h-6 w-6 text-red-500" />
    if (direction.includes("DOWN"))
      return <TrendingDown className="h-6 w-6 text-green-500" />
    return <Minus className="h-6 w-6 text-gray-500" />
  }

  if (isLoading)
    return <div className="p-10 text-center">Loading Tracker...</div>

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <div className="flex items-center space-x-3">
          <div className="rounded-lg bg-blue-600 p-3">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Electricity Tracker
            </h1>
            <p className="text-muted-foreground">
              Monitor usage and forecast future bills.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Input Form Card */}
          <Card className="col-span-1 shadow-sm">
            <CardHeader>
              <CardTitle>Log New Reading</CardTitle>
              <CardDescription>Enter the latest meter reading.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={form.control}
                    name="month"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Billing Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="current_value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current Meter Reading (kWh)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="amps"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Capacity (Amps)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    Save Reading
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Chart & Forecast Card */}
          <Card className="col-span-1 shadow-sm md:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle>Usage Trend & Forecast</CardTitle>
                <CardDescription>
                  Historical consumption vs predicted trend.
                </CardDescription>
              </div>
              {forecast && (
                <div className="flex items-center space-x-2 rounded-full bg-gray-100 px-3 py-1.5">
                  {getTrendIcon(forecast.trend_direction)}
                  <span className="text-sm font-medium">
                    {forecast.trend_direction.split(".")[0]}
                  </span>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="mt-4 h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={prepareChartData()}
                    margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={12} tickMargin={10} />
                    <YAxis fontSize={12} tickFormatter={(val) => `${val}u`} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="Actual"
                      stroke="#2563eb"
                      strokeWidth={3}
                      activeDot={{ r: 8 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Predicted"
                      stroke="#f59e0b"
                      strokeWidth={3}
                      strokeDasharray="5 5"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
