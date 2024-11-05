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
            Regex rx = new Regex(EmailRegExPattern);
            StringBuilder scrubbedData = new StringBuilder();

            int lastEndMatchIndex = 0;
            foreach (Match match in rx.Matches(data))
            {
                // Append the part of the string not matched by the regex
                scrubbedData.Append(data, lastEndMatchIndex, match.Index - lastEndMatchIndex);

                // Append the replacement char for the length of the match
                scrubbedData.Append(replacementChar, match.Length);

                lastEndMatchIndex = match.Index + match.Length;
            }

            // Append the remainder of the string
            scrubbedData.Append(data, lastEndMatchIndex, data.Length - lastEndMatchIndex);

            return scrubbedData.ToString();
        }
    }
}
