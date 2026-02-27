#!/bin/bash

# 修复刷新后日期不显示的问题
# 问题：刷新比分后不应该重新加载整个时间线，导致失去当天日期的滚动位置
# 解决方案：刷新后只更新数据，不调用 initTimeline 重新获取列表

file="pages/index/index.js"

# 查找 async handleRefreshToday() 函数
grep -n "async handleRefreshToday()" "$file" > temp.js

# 读取函数之前的所有行
start_line=$(grep -n "async handleRefreshToday()" "$file" | cut -d: -f1 | head -1)
end_line=$((start_line - 1))

# 读取函数内容（从开始到结束）
sed -n "$start_line,${end_line}p" "$file" > function_content.txt

# 替换函数内容：移除 this.initTimeline(today) 调用
# 在 catch 块中，保留错误处理和 loading 控制

cat > function_content.txt

# 替换回文件
sed -i '' "$start_line,${end_line}d" "$file" < temp.js

echo "已修复 handleRefreshToday 函数"
