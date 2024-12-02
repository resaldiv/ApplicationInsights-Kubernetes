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
            StringBuilder sb = new StringBuilder(data);
            Regex rx = new Regex(EmailRegExPattern);
            foreach (Match match in rx.Matches(data))
            {
                string replacementString = new string(replacementChar, match.Value.Length);
                sb.Remove(match.Index, match.Length);
                sb.Insert(match.Index, replacementString);
            }

            return sb.ToString();
        }
    }
}
