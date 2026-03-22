<template>
  <div class="login-wrapper">
    <n-card class="login-card" title="WiFi Monitor 管理员登录">
      <n-form ref="formRef" :model="form" :rules="rules" @submit.prevent="handleSubmit">
        <n-form-item path="username" label="用户名">
          <n-input v-model:value="form.username" placeholder="请输入用户名" />
        </n-form-item>
        <n-form-item path="password" label="密码">
          <n-input
            v-model:value="form.password"
            placeholder="请输入密码"
            type="password"
            show-password-on="click"
          />
        </n-form-item>
        <n-space vertical size="small">
          <n-button type="primary" block attr-type="submit" :loading="submitting">
            登录
          </n-button>
          <n-button block quaternary @click="router.push('/')">
            返回公开看板
          </n-button>
        </n-space>
      </n-form>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { FormInst, FormRules } from 'naive-ui';
import { useMessage } from 'naive-ui';
import { useRoute, useRouter } from 'vue-router';
import { loginApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const route = useRoute();
const message = useMessage();
const auth = useAuthStore();

const formRef = ref<FormInst | null>(null);
const submitting = ref(false);
const form = ref({
  username: '',
  password: '',
});

const rules: FormRules = {
  username: {
    required: true,
    trigger: ['blur', 'input'],
    message: '请输入用户名',
  },
  password: {
    required: true,
    trigger: ['blur', 'input'],
    message: '请输入密码',
  },
};

async function handleSubmit() {
  if (submitting.value) {
    return;
  }

  await formRef.value?.validate();

  submitting.value = true;
  try {
    const result = await loginApi(form.value);
    auth.setAuth(result);
    message.success(`欢迎，${result.user.displayName}`);
    const redirect = (route.query.redirect as string) || '/admin';
    router.replace(redirect);
  } catch (error) {
    console.error(error);
    message.error('登录失败，请检查用户名或密码');
  } finally {
    submitting.value = false;
  }
}
</script>
