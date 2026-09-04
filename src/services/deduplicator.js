/**
 * Student Activity Deduplication and Cleaning Service
 */

// Cyrillic to Latin transliteration map for Uzbek/Russian characters
const CYRILLIC_TO_LATIN = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j', 'з': 'z',
    'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
    'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh',
    'ъ': '', 'ы': 'i', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'қ': 'q', 'ҳ': 'h', 'ғ': 'g', 'ў': 'o'
};

/**
 * Transliterates Cyrillic text to Latin
 */
export function transliterate(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .split('')
        .map(char => CYRILLIC_TO_LATIN[char] || char)
        .join('');
}

/**
 * Normalizes a name to a standardized format for matching:
 * 1. Transliterates Cyrillic to Latin.
 * 2. Standardizes Uzbek apostrophes and spelling variations (e.g. o', g' -> o, g).
 * 3. Strips patronymics (e.g., ending with ovich, ovna, evich, evna, or standalone o'g'li, qizi).
 * 4. Cleans special characters.
 * 5. Sorts name parts alphabetically to handle word order variations (e.g. "Aliyev Sardor" vs "Sardor Aliyev").
 */
export function normalizeName(name, stripPatronymics = true) {
    if (!name) return '';

    // 1. Convert to lowercase & strip Cyrillic soft/hard signs before transliteration
    let cleaned = name.trim().toLowerCase().replace(/[ьъ]/g, '');

    // 2. Transliterate Cyrillic to Latin
    cleaned = transliterate(cleaned);

    // 3. Normalize Uzbek apostrophes, spelling variations, and vowel swaps
    cleaned = cleaned
        .replace(/[‘’’`´']/g, '') // remove apostrophes for comparison
        .replace(/g[h]/g, 'g')    // gh -> g
        .replace(/s[h]/g, 'sh')   // standardize sh
        .replace(/c[h]/g, 'ch')   // standardize ch
        .replace(/iy/g, 'i')      // iy -> i (standardize Aliyev/Aliev, Valiyev/Valiev)
        .replace(/u/g, 'o')       // u -> o (standardize Uktam/Oktam, Yuldashev/Yoldoshev)
        .replace(/e/g, 'i');      // e -> i (standardize Aliev/Aliiv, Valiyev/Valiiv)

    // 4. Strip patronymics and suffixes if enabled
    if (stripPatronymics) {
        // Remove Uzbek patronymic qualifiers
        cleaned = cleaned
            .replace(/\bo['`‘]g['`‘]li\b/g, '')
            .replace(/\bugli\b/g, '')
            .replace(/\bogli\b/g, '')
            .replace(/\bqizi\b/g, '')
            .replace(/\bgizi\b/g, '')
            .replace(/\bqyzy\b/g, '')
            // Cyrillic equivalents (though transliterated above, they would match these latin strings)
            .replace(/\bogli\b/g, '')
            .replace(/\bqizi\b/g, '');

        // Remove Russian patronymic suffixes
        cleaned = cleaned
            .replace(/\b(\w+)(ovich|ovna|evich|evna|yevich|yevna|ich)\b/g, '')
            .replace(/\b(\w+)(ovna|ovich)\b/g, '');
    }

    // 4. Remove all non-alphanumeric characters except spaces
    cleaned = cleaned.replace(/[^a-z0-9\s]/g, ' ');

    // 5. Split into words, filter out short tokens (initials) and empty ones, sort alphabetically
    const words = cleaned
        .split(/\s+/)
        .filter(word => word.length > 1) // exclude single initials like "A."
        .sort();

    return words.join(' ');
}

/**
 * Calculates Jaro-Winkler similarity between two strings
 * Returns a score between 0.0 (no similarity) and 1.0 (exact match)
 */
export function jaroWinklerSimilarity(s1, s2) {
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0.0;

    const len1 = s1.length;
    const len2 = s2.length;

    // Match window size
    let matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
    if (matchWindow < 0) matchWindow = 0;

    const matches1 = new Array(len1).fill(false);
    const matches2 = new Array(len2).fill(false);

    let matches = 0;
    let transpositions = 0;

    // Find matches
    for (let i = 0; i < len1; i++) {
        const start = Math.max(0, i - matchWindow);
        const end = Math.min(len2, i + matchWindow + 1);

        for (let j = start; j < end; j++) {
            if (matches2[j]) continue;
            if (s1[i] === s2[j]) {
                matches1[i] = true;
                matches2[j] = true;
                matches++;
                break;
            }
        }
    }

    if (matches === 0) return 0.0;

    // Count transpositions
    let k = 0;
    for (let i = 0; i < len1; i++) {
        if (!matches1[i]) continue;
        while (!matches2[k]) k++;
        if (s1[i] !== s2[k]) {
            transpositions++;
        }
        k++;
    }

    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3.0;

    // Winkler adjustment for common prefix (up to 4 chars)
    let prefixLength = 0;
    const maxPrefix = 4;
    const scalingFactor = 0.1;

    for (let i = 0; i < Math.min(maxPrefix, Math.min(len1, len2)); i++) {
        if (s1[i] === s2[i]) {
            prefixLength++;
        } else {
            break;
        }
    }

    return jaro + prefixLength * scalingFactor * (1.0 - jaro);
}

/**
 * Standardizes capitalization of names (e.g. "aliyev sardor" -> "Aliyev Sardor")
 */
export function capitalizeName(name) {
    if (!name) return '';
    return name
        .trim()
        .split(/\s+/)
        .map(word => {
            // Handle lowercase/uppercase parts (e.g. o'g'li -> o'g'li or O'g'li)
            if (word.toLowerCase() === "o'g'li" || word.toLowerCase() === "qizi" || word.toLowerCase() === "o‘g‘li") {
                return word.toLowerCase();
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
}

/**
 * Main function to process raw student activity records:
 * - Cleans and standardizes student names.
 * - Clusters duplicates using Jaro-Winkler fuzzy matching.
 * - Resolves student identities and assigns unique student IDs.
 * - Aggregates club and event participation counts/lists.
 * - Computes activity levels.
 * - Prepares final datasets for Sheets 1 and 2.
 */
export function processStudentData(rawRows, mappings, threshold = 0.88, stripPatronymics = true) {
    const nameCol = mappings.nameColumn;
    const clubCol = mappings.clubColumn;
    const eventCol = mappings.eventColumn;

    // Filter out rows that have no name
    const validRows = rawRows.filter(row => row && row[nameCol] && String(row[nameCol]).trim().length > 0);

    // Step 1: Extract unique names and compute their normalized form
    const uniqueRawNames = Array.from(new Set(validRows.map(row => String(row[nameCol]).trim())));
    
    // Sort unique names to ensure deterministic clustering behavior
    uniqueRawNames.sort();

    // Mapping from raw name string to its cluster object
    const nameToClusterMap = {};
    const clusters = [];

    // Step 2: Clustering with Fuzzy Matching
    for (const rawName of uniqueRawNames) {
        const normName = normalizeName(rawName, stripPatronymics);

        let bestMatchCluster = null;
        let highestScore = 0;

        // Compare with existing clusters
        for (const cluster of clusters) {
            // Compare the current normalized name with the cluster's normalized representative name
            const score = jaroWinklerSimilarity(normName, cluster.normalizedName);
            if (score >= threshold && score > highestScore) {
                highestScore = score;
                bestMatchCluster = cluster;
            }
        }

        if (bestMatchCluster) {
            // Match found, add raw name to this cluster
            bestMatchCluster.rawNames.push({
                rawName: rawName,
                score: highestScore
            });
            nameToClusterMap[rawName] = bestMatchCluster;

            // Update canonical name if this rawName is longer (usually has more complete details like patronymics)
            if (rawName.length > bestMatchCluster.canonicalName.length) {
                bestMatchCluster.canonicalName = rawName;
            }
        } else {
            // No match found, create a new cluster
            const newCluster = {
                id: '', // Will be assigned later
                canonicalName: rawName,
                normalizedName: normName,
                rawNames: [{ rawName: rawName, score: 1.0 }]
            };
            clusters.push(newCluster);
            nameToClusterMap[rawName] = newCluster;
        }
    }

    // Assign Student IDs to clusters
    clusters.forEach((cluster, idx) => {
        const numStr = String(idx + 1).padStart(5, '0');
        cluster.id = `STU-${numStr}`;
        // Standardize capitalization of the canonical master name
        cluster.masterName = capitalizeName(cluster.canonicalName);
    });

    // Step 3: Process and Aggregate Data
    // We will group records by cluster ID to compute stats
    const clusterData = {};

    clusters.forEach(cluster => {
        clusterData[cluster.id] = {
            student_id: cluster.id,
            full_name: cluster.masterName,
            clubs: new Set(),
            events: new Set(),
            rawRecords: []
        };
    });

    // Populate cluster data from original rows
    validRows.forEach(row => {
        const rawName = String(row[nameCol]).trim();
        const cluster = nameToClusterMap[rawName];
        if (!cluster) return;

        const cData = clusterData[cluster.id];
        
        // Extract club and event
        const clubVal = clubCol && row[clubCol] ? String(row[clubCol]).trim() : '';
        const eventVal = eventCol && row[eventCol] ? String(row[eventCol]).trim() : '';

        if (clubVal && clubVal !== '-' && clubVal !== 'yo\'q' && clubVal !== 'none') {
            cData.clubs.add(clubVal);
        }
        if (eventVal && eventVal !== '-' && eventVal !== 'yo\'q' && eventVal !== 'none') {
            cData.events.add(eventVal);
        }

        cData.rawRecords.push({
            original_name: rawName,
            club: clubVal,
            event: eventVal,
            confidence: nameToClusterMap[rawName].rawNames.find(rn => rn.rawName === rawName)?.score || 1.0
        });
    });

    // Step 4: Format Sheet 1: Students_Master
    const studentsMaster = Object.values(clusterData).map(cData => {
        const club_count = cData.clubs.size;
        const event_count = cData.events.size;
        const total_participation = club_count + event_count;

        // Categorize Activity Level:
        // 0–2 → Low, 3–6 → Medium, 7–15 → High, 15+ → Very High
        let activity_level = 'Low';
        if (total_participation >= 15) {
            activity_level = 'Very High';
        } else if (total_participation >= 7) {
            activity_level = 'High';
        } else if (total_participation >= 3) {
            activity_level = 'Medium';
        }

        return {
            student_id: cData.student_id,
            full_name: cData.full_name,
            club_count,
            event_count,
            total_participation,
            clubs_list: Array.from(cData.clubs).sort().join(', ') || '-',
            events_list: Array.from(cData.events).sort().join(', ') || '-',
            activity_level
        };
    });

    // Sort Students Master by total participation descending
    studentsMaster.sort((a, b) => b.total_participation - a.total_participation);

    // Step 5: Format Sheet 2: Raw_vs_Matched
    const rawVsMatched = [];
    validRows.forEach(row => {
        const rawName = String(row[nameCol]).trim();
        const cluster = nameToClusterMap[rawName];
        if (!cluster) return;

        const clubVal = clubCol && row[clubCol] ? String(row[clubCol]).trim() : '';
        const eventVal = eventCol && row[eventCol] ? String(row[eventCol]).trim() : '';

        // Find confidence score
        const score = cluster.rawNames.find(rn => rn.rawName === rawName)?.score || 1.0;
        const confidencePercentage = Math.round(score * 100);

        rawVsMatched.push({
            original_name: rawName,
            matched_student_id: cluster.id,
            matched_full_name: cluster.masterName,
            'matching_confidence_score (%)': confidencePercentage,
            club: clubVal || '-',
            event: eventVal || '-'
        });
    });

    return {
        studentsMaster,
        rawVsMatched,
        summaryStats: calculateSummaryStats(studentsMaster, rawVsMatched)
    };
}

/**
 * Computes general metrics for the summary cards
 */
function calculateSummaryStats(studentsMaster, rawVsMatched) {
    const totalUniqueStudents = studentsMaster.length;
    
    // Sum of participations
    const totalClubParticipations = studentsMaster.reduce((sum, s) => sum + s.club_count, 0);
    const totalEventParticipations = studentsMaster.reduce((sum, s) => sum + s.event_count, 0);

    // Most active student
    let mostActiveStudentName = '-';
    let mostActiveStudentScore = 0;
    if (studentsMaster.length > 0) {
        // Since we sorted by total_participation desc:
        mostActiveStudentName = studentsMaster[0].full_name;
        mostActiveStudentScore = studentsMaster[0].total_participation;
    }

    // Most active club
    const clubCounts = {};
    rawVsMatched.forEach(row => {
        const club = row.club;
        if (club && club !== '-' && club !== 'yo\'q' && club !== 'none') {
            clubCounts[club] = (clubCounts[club] || 0) + 1;
        }
    });

    let mostActiveClub = '-';
    let maxClubCount = 0;
    Object.entries(clubCounts).forEach(([club, count]) => {
        if (count > maxClubCount) {
            maxClubCount = count;
            mostActiveClub = club;
        }
    });

    return {
        totalUniqueStudents,
        totalClubParticipations,
        totalEventParticipations,
        mostActiveStudent: `${mostActiveStudentName} (${mostActiveStudentScore})`,
        mostActiveClub: mostActiveClub !== '-' ? `${mostActiveClub} (${maxClubCount} marta)` : '-'
    };
}
