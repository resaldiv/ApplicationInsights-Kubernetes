using BenchmarkDotNet.Attributes;
using BenchmarkDotNet.Running;
using Microsoft.ApplicationInsights.Kubernetes;

namespace Benchmarks
{
    [JsonExporterAttribute.Full]
    [JsonExporterAttribute.FullCompressed]
    public class StringUtilsBenchmark
    {
        [Params(25, 1023, 1024, 1025, 2097152, 3758096384, 3848290697216)]
        public long Input { get; set; }

        [Benchmark]
        public string BenchmarkGetReadableSize()
        {
            return StringUtils.GetReadableSize(Input);
        }
    }

    public class Program
    {
        public static void Main(string[] args)
        {
            var summary = BenchmarkRunner.Run<StringUtilsBenchmark>();
        }
    }
}