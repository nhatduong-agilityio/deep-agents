export interface TestCase {
  input: unknown[];
  expected: unknown;
}

export interface Problem {
  id: string;
  description: string;
  functionName: string;
  paramNames: string[];
  testCases: TestCase[];
}

export const PROBLEMS: Problem[] = [
  {
    id: 'p01',
    functionName: 'numDecodings',
    paramNames: ['s'],
    description:
      'A string of digits can be decoded: "1"→A, "2"→B, ..., "26"→Z. Return the number of ways to decode the string s. "0" alone is invalid; leading zeros make a code invalid (e.g. "06" cannot map to "F").',
    testCases: [
      { input: ['12'], expected: 2 },
      { input: ['226'], expected: 3 },
      { input: ['0'], expected: 0 },
      { input: ['06'], expected: 0 },
      { input: ['11106'], expected: 2 },
      { input: ['10'], expected: 1 },
    ],
  },
  {
    id: 'p02',
    functionName: 'maxProfit',
    paramNames: ['prices'],
    description:
      'Given an array of stock prices where prices[i] is the price on day i, return the maximum profit from a single buy-then-sell. If no profit is possible, return 0.',
    testCases: [
      { input: [[7, 1, 5, 3, 6, 4]], expected: 5 },
      { input: [[7, 6, 4, 3, 1]], expected: 0 },
      { input: [[2, 4, 1]], expected: 2 },
      { input: [[1]], expected: 0 },
    ],
  },
  {
    id: 'p03',
    functionName: 'isValid',
    paramNames: ['s'],
    description:
      'Given a string containing only "(", ")", "{", "}", "[", "]", determine if the brackets are valid. Empty string is valid.',
    testCases: [
      { input: ['()'], expected: true },
      { input: ['()[]{} '], expected: false },
      { input: ['(]'], expected: false },
      { input: [''], expected: true },
      { input: ['({[]})'], expected: true },
      { input: [')'], expected: false },
    ],
  },
  {
    id: 'p04',
    functionName: 'climbStairs',
    paramNames: ['n'],
    description:
      'You are climbing a staircase with n steps. Each time you can climb 1 or 2 steps. Return the number of distinct ways to reach the top.',
    testCases: [
      { input: [1], expected: 1 },
      { input: [2], expected: 2 },
      { input: [3], expected: 3 },
      { input: [5], expected: 8 },
      { input: [10], expected: 89 },
    ],
  },
  {
    id: 'p05',
    functionName: 'isPalindrome',
    paramNames: ['s'],
    description:
      'Given a string s, return true if it is a palindrome considering only alphanumeric characters and ignoring case. Return false otherwise.',
    testCases: [
      { input: ['A man, a plan, a canal: Panama'], expected: true },
      { input: ['race a car'], expected: false },
      { input: [''], expected: true },
      { input: [' '], expected: true },
      { input: ['0P'], expected: false },
    ],
  },
  {
    id: 'p06',
    functionName: 'jump',
    paramNames: ['nums'],
    description:
      'Given an integer array nums where nums[i] is the maximum jump length from index i, return the minimum number of jumps to reach the last index. You can always reach the last index.',
    testCases: [
      { input: [[2, 3, 1, 1, 4]], expected: 2 },
      { input: [[2, 3, 0, 1, 4]], expected: 2 },
      { input: [[1, 1, 1, 1]], expected: 3 },
      { input: [[1]], expected: 0 },
      { input: [[10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1, 0]], expected: 2 },
    ],
  },
  {
    id: 'p07',
    functionName: 'minWindow',
    paramNames: ['s', 't'],
    description:
      'Given two strings s and t, return the minimum window substring of s such that every character in t (including duplicates) is included. If no such window exists, return "". The answer is guaranteed to be unique.',
    testCases: [
      { input: ['ADOBECODEBANC', 'ABC'], expected: 'BANC' },
      { input: ['a', 'a'], expected: 'a' },
      { input: ['a', 'aa'], expected: '' },
      { input: ['aa', 'aa'], expected: 'aa' },
      { input: ['cabwefgewcwaefgcf', 'cae'], expected: 'cwae' },
    ],
  },
  {
    id: 'p08',
    functionName: 'longestCommonPrefix',
    paramNames: ['strs'],
    description:
      'Write a function to find the longest common prefix string amongst an array of strings. If there is no common prefix, return an empty string "".',
    testCases: [
      { input: [['flower', 'flow', 'flight']], expected: 'fl' },
      { input: [['dog', 'racecar', 'car']], expected: '' },
      { input: [[]], expected: '' },
      { input: [['single']], expected: 'single' },
      { input: [['ab', 'a']], expected: 'a' },
    ],
  },
  {
    id: 'p09',
    functionName: 'reverseWords',
    paramNames: ['s'],
    description:
      'Given a string s, reverse the order of the words. Words are separated by spaces. Return the result with a single space between words and no leading/trailing spaces.',
    testCases: [
      { input: ['the sky is blue'], expected: 'blue is sky the' },
      { input: ['  hello world  '], expected: 'world hello' },
      { input: ['a good   example'], expected: 'example good a' },
      { input: ['  Bob    Loves  Alice   '], expected: 'Alice Loves Bob' },
    ],
  },
  {
    id: 'p10',
    functionName: 'countBits',
    paramNames: ['n'],
    description:
      'Given an integer n, return an array ans of length n + 1 such that for each i (0 <= i <= n), ans[i] is the number of 1s in the binary representation of i.',
    testCases: [
      { input: [2], expected: [0, 1, 1] },
      { input: [5], expected: [0, 1, 1, 2, 1, 2] },
      { input: [0], expected: [0] },
      { input: [1], expected: [0, 1] },
    ],
  },
  {
    id: 'p11',
    functionName: 'coinChange',
    paramNames: ['coins', 'amount'],
    description:
      'Given an integer array coins representing coin denominations and an integer amount, return the fewest number of coins needed to make up amount. If it cannot be made up, return -1.',
    testCases: [
      { input: [[1, 5, 10, 25], 30], expected: 2 },
      { input: [[2], 3], expected: -1 },
      { input: [[1], 0], expected: 0 },
      { input: [[1, 2, 5], 11], expected: 3 },
      { input: [[186, 419, 83, 408], 6249], expected: 20 },
    ],
  },
  {
    id: 'p12',
    functionName: 'uniquePaths',
    paramNames: ['m', 'n'],
    description:
      'A robot starts at the top-left of an m x n grid and can only move right or down. Return the number of unique paths to the bottom-right corner.',
    testCases: [
      { input: [3, 7], expected: 28 },
      { input: [3, 2], expected: 3 },
      { input: [1, 1], expected: 1 },
      { input: [2, 2], expected: 2 },
    ],
  },
  {
    id: 'p13',
    functionName: 'numSquares',
    paramNames: ['n'],
    description:
      'Given an integer n, return the least number of perfect square numbers that sum to n.',
    testCases: [
      { input: [12], expected: 3 },
      { input: [13], expected: 2 },
      { input: [1], expected: 1 },
      { input: [4], expected: 1 },
    ],
  },
  {
    id: 'p14',
    functionName: 'titleToNumber',
    paramNames: ['columnTitle'],
    description:
      'Convert an Excel column title (like "A", "B", "Z", "AA", "AB") to its corresponding column number.',
    testCases: [
      { input: ['A'], expected: 1 },
      { input: ['Z'], expected: 26 },
      { input: ['AA'], expected: 27 },
      { input: ['AB'], expected: 28 },
      { input: ['ZY'], expected: 701 },
    ],
  },
  {
    id: 'p15',
    functionName: 'partitionLabels',
    paramNames: ['s'],
    description:
      'You are given a string s. Partition the string into as many parts as possible so that each letter appears in at most one part. Return a list of integers representing the size of each part.',
    testCases: [
      { input: ['ababcbacadefegdehijhklij'], expected: [9, 7, 8] },
      { input: ['eccbbbbdec'], expected: [10] },
      { input: ['a'], expected: [1] },
      { input: ['abcd'], expected: [1, 1, 1, 1] },
      { input: ['caedbdedda'], expected: [1, 9] },
    ],
  },
  {
    id: 'p16',
    functionName: 'findDisappearedNumbers',
    paramNames: ['nums'],
    description:
      'Given an array nums of n integers where each value is in range [1, n], return all integers in [1, n] that do not appear in the array.',
    testCases: [
      { input: [[4, 3, 2, 7, 8, 2, 3, 1]], expected: [5, 6] },
      { input: [[1, 1]], expected: [2] },
      { input: [[1, 2, 3]], expected: [] },
      { input: [[2, 2]], expected: [1] },
    ],
  },
  {
    id: 'p17',
    functionName: 'maxSubArray',
    paramNames: ['nums'],
    description:
      'Given an integer array nums, find the contiguous subarray with the largest sum and return its sum.',
    testCases: [
      { input: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], expected: 6 },
      { input: [[1]], expected: 1 },
      { input: [[5, 4, -1, 7, 8]], expected: 23 },
      { input: [[-1]], expected: -1 },
      { input: [[-2, -1]], expected: -1 },
    ],
  },
  {
    id: 'p18',
    functionName: 'rotate',
    paramNames: ['nums', 'k'],
    description:
      'Given an integer array nums, rotate it to the right by k steps in-place and return the modified array.',
    testCases: [
      {
        input: [[1, 2, 3, 4, 5, 6, 7], 3],
        expected: [5, 6, 7, 1, 2, 3, 4],
      },
      { input: [[-1, -100, 3, 99], 2], expected: [3, 99, -1, -100] },
      { input: [[1, 2], 3], expected: [2, 1] },
      { input: [[1], 0], expected: [1] },
    ],
  },
  {
    id: 'p19',
    functionName: 'findAnagrams',
    paramNames: ['s', 'p'],
    description:
      "Given two strings s and p, return an array of all the start indices of p's anagrams in s. An anagram is a string that uses the same characters in the same frequency, in any order.",
    testCases: [
      { input: ['cbaebabacd', 'abc'], expected: [0, 6] },
      { input: ['abab', 'ab'], expected: [0, 1, 2] },
      { input: ['af', 'be'], expected: [] },
      { input: ['baa', 'aa'], expected: [1] },
      { input: ['aaaaaaaaaa', 'aaaaaaaaaaaaa'], expected: [] },
    ],
  },
  {
    id: 'p20',
    functionName: 'productExceptSelf',
    paramNames: ['nums'],
    description:
      'Given an integer array nums, return an array answer such that answer[i] is the product of all elements of nums except nums[i]. Must run in O(n) without division.',
    testCases: [
      { input: [[1, 2, 3, 4]], expected: [24, 12, 8, 6] },
      { input: [[-1, 1, 0, -3, 3]], expected: [0, 0, 9, 0, 0] },
      { input: [[2, 3]], expected: [3, 2] },
      { input: [[1, 1, 1, 1]], expected: [1, 1, 1, 1] },
    ],
  },
];
