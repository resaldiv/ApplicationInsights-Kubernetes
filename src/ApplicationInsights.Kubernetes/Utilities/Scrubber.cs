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
            int previousMatchEnd = 0;

            foreach (Match match in rx.Matches(data))
            {
                // Append the part of the string before the match
                scrubbedData.Append(data.Substring(previousMatchEnd, match.Index - previousMatchEnd));

                // Append the replacement string
                scrubbedData.Append(new string(replacementChar, match.Value.Length));

                // Update the end of the previous match
                previousMatchEnd = match.Index + match.Length;
            }

            // Append the rest of the string after the last match
            scrubbedData.Append(data.Substring(previousMatchEnd));

            return scrubbedData.ToString();
        }
    }
}
