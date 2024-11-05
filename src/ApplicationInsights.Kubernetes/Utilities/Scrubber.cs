// ---------------------------------------------------------------------------
// <copyright file="Scrubber.cs" company="Microsoft">
//     Copyright (c) Microsoft Corporation.  All rights reserved.
// </copyright>
// ---------------------------------------------------------------------------

namespace Microsoft.ApplicationInsights.Kubernetes
{
    using System;
    using System.Collections.Generic;
    using System.Linq;
    using System.Text.RegularExpressions;

    public class Scrubber
    {
        public const string EmailRegExPattern = @"[a-zA-Z0-9!#$+\-^_~]+(?:\.[a-zA-Z0-9!#$+\-^_~]+)*@(?:[a-zA-Z0-9\-]+\.)+[a-zA-Z]{2,6}";
        public static string ScrubData(string data, char replacementChar)
        {
            StringBuilder scrubbedData = new StringBuilder();

            Regex rx = new Regex(EmailRegExPattern);
            int start = 0;

            foreach (Match match in rx.Matches(data))
            {
                scrubbedData.Append(data.Substring(start, match.Index - start));
                scrubbedData.Append(new string(replacementChar, match.Length));

                start = match.Index + match.Length;
            }

            scrubbedData.Append(data.Substring(start));

            return scrubbedData.ToString();
        }
    }
}
